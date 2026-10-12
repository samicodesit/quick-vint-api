import {
  DEFAULT_DRAFT_SETTINGS,
  DRAFT_LIMITS,
  normalizeDraftSettings,
  validateDraftAction,
  type Draft,
  type DraftLibrary,
  type DraftPhoto,
  validDraftId,
} from "./draftContracts";
import type {
  MobileGenerationInput,
  MobileGenerationResult,
} from "./generationClient";

type Row = Omit<Draft, "photos"> & { created_at: string };
export interface LocalDraftAttempt {
  draftId: string;
  operationId: string;
  inputVersion: number;
  batch: boolean;
  createdAt: number;
  sentAt?: number;
  input?: MobileGenerationInput;
  upload?: { sessionId: string; uploaderId: string };
}
type Snapshot = {
  draftCount: number;
  drafts: Map<string, Row>;
  photos: Map<string, DraftPhoto>;
  attempts: Map<string, LocalDraftAttempt>;
  tx: IDBTransaction;
  blob?: { id: string; blob: Blob; original?: Blob };
};
type Scope = {
  blobId?: string;
  draftIds?: string[];
  itemPhotos?: string;
  photoId?: string;
  noPhotos?: boolean;
  attemptId?: string;
  page?: { state: "draft" | "done"; cursor?: string };
};
type PhotoRow = DraftPhoto & { group_key: string };

export function localDraftError(code: string, message: string, status = 409) {
  return Object.assign(new Error(message), { code, status });
}
const conflict = () =>
  localDraftError(
    "draft_conflict",
    "This item changed in another tab. Reload its saved version.",
  );
const busy = (draft: Row) =>
  draft.operation_state === "running" || draft.operation_state === "pending";
function editable(draft: Row) {
  if (busy(draft))
    throw localDraftError(
      "generation_in_progress",
      "Check this item's generation result before making changes.",
    );
}
function storageError(error: unknown) {
  if (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string"
  )
    return error;
  const full = error instanceof Error && error.name === "QuotaExceededError";
  return localDraftError(
    full ? "storage_limit" : "local_storage_unavailable",
    full
      ? "This browser's storage is full. Delete unused items or photos, then try again."
      : "This browser could not save your drafts. Allow site storage and try again.",
    503,
  );
}
function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}
function pageRows(index: IDBIndex, range: IDBKeyRange): Promise<Row[]> {
  return new Promise((resolve, reject) => {
    const rows: Row[] = [];
    const read = index.openCursor(range, "prev");
    read.onerror = () => reject(read.error);
    read.onsuccess = () => {
      const cursor = read.result;
      if (!cursor || rows.length === 31) {
        resolve(rows);
        return;
      }
      rows.push(cursor.value);
      cursor.continue();
    };
  });
}

/** Metadata transactions never read all image blobs. URLs live only in this workspace. */
export class LocalDraftStore {
  private connection?: Promise<IDBDatabase>;
  private disposed = false;
  private urls = new Map<string, string>();
  private urlRevisions = new Map<string, number>();
  constructor(readonly userId: string) {
    if (!userId)
      throw localDraftError(
        "local_storage_unavailable",
        "Sign in to open your drafts.",
      );
  }
  private open() {
    if (this.disposed) return Promise.reject(storageError(new Error("closed")));
    if (!this.connection) {
      this.connection = new Promise<IDBDatabase>((resolve, reject) => {
        let blocked = false;
        if (!globalThis.indexedDB)
          return reject(storageError(new Error("unavailable")));
        const opening = indexedDB.open(
          `autolister:drafts:v1:${this.userId}`,
          2,
        );
        opening.onupgradeneeded = () => {
          const db = opening.result;
          for (const store of ["drafts", "photos", "blobs", "attempts"])
            if (!db.objectStoreNames.contains(store))
              db.createObjectStore(store, {
                keyPath: store === "attempts" ? "draftId" : "id",
              });
          const drafts = opening.transaction!.objectStore("drafts");
          if (!drafts.indexNames.contains("library"))
            drafts.createIndex("library", ["state", "created_at", "id"]);
          const photos = opening.transaction!.objectStore("photos");
          if (!photos.indexNames.contains("group")) {
            photos.createIndex("group", "group_key");
            const cursor = photos.openCursor();
            cursor.onsuccess = () => {
              const row = cursor.result;
              if (row) {
                row.update({
                  ...row.value,
                  group_key: row.value.draft_id || "",
                });
                row.continue();
              }
            };
          }
        };
        opening.onerror = () => reject(storageError(opening.error));
        opening.onblocked = () => {
          blocked = true;
          reject(
            localDraftError(
              "local_storage_unavailable",
              "Close other AutoLister tabs, then reload to open your drafts.",
              503,
            ),
          );
        };
        opening.onsuccess = () => {
          const db = opening.result;
          if (this.disposed || blocked) {
            db.close();
            reject(storageError(new Error("closed")));
            return;
          }
          db.onversionchange = () => {
            db.close();
            this.connection = undefined;
          };
          resolve(db);
        };
      }).catch((error) => {
        this.connection = undefined;
        throw error;
      });
    }
    return this.connection;
  }
  private async transact<T>(
    mode: IDBTransactionMode,
    operation: (data: Snapshot) => T,
    scope: Scope = {},
  ): Promise<T> {
    try {
      const db = await this.open();
      const tx = db.transaction(
        ["drafts", "photos", "blobs", "attempts"],
        mode,
      );
      const finished = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error || new Error("transaction aborted"));
        tx.onerror = () => {}; // onabort owns the failed transaction.
      });
      // Attach the rejection handler immediately, including when validation aborts.
      void finished.catch(() => {});
      try {
        const draftStore = tx.objectStore("drafts");
        const photoStore = tx.objectStore("photos");
        let owner: Row | undefined;
        const singlePhoto = scope.photoId
          ? request<PhotoRow | undefined>(photoStore.get(scope.photoId))
          : undefined;
        const photoRows = scope.noPhotos
          ? Promise.resolve([])
          : singlePhoto
            ? singlePhoto.then((row) => (row ? [row] : []))
            : scope.itemPhotos
              ? request<PhotoRow[]>(
                  photoStore.index("group").getAll(scope.itemPhotos),
                )
              : request<PhotoRow[]>(photoStore.getAll());
        const draftRows = async (): Promise<Row[]> => {
          if (singlePhoto) {
            const photo = await singlePhoto;
            owner = photo?.draft_id
              ? await request<Row | undefined>(draftStore.get(photo.draft_id))
              : undefined;
            return owner ? [owner] : [];
          }
          if (scope.page) {
            const { state, cursor } = scope.page;
            const last = cursor
              ? await request<Row | undefined>(draftStore.get(cursor))
              : undefined;
            if (cursor && (!last || last.state !== state))
              throw localDraftError("invalid_cursor", "Reload your drafts.");
            return pageRows(
              draftStore.index("library"),
              IDBKeyRange.bound(
                [state, "", ""],
                last
                  ? [state, last.created_at, last.id]
                  : [state, "\uffff", "\uffff"],
                false,
                !!last,
              ),
            );
          }
          if (scope.draftIds)
            return (
              await Promise.all(
                scope.draftIds.map((id) =>
                  request<Row | undefined>(draftStore.get(id)),
                ),
              )
            ).filter((row): row is Row => !!row);
          return request<Row[]>(draftStore.getAll());
        };
        const [drafts, photos, attempts, draftCount, blob] = await Promise.all([
          draftRows(),
          photoRows,
          scope.attemptId
            ? request<LocalDraftAttempt | undefined>(
                tx.objectStore("attempts").get(scope.attemptId),
              ).then((row) => (row ? [row] : []))
            : Promise.resolve([]),
          request(draftStore.count()),
          scope.blobId
            ? request<{ id: string; blob: Blob; original?: Blob } | undefined>(
                tx.objectStore("blobs").get(scope.blobId),
              )
            : Promise.resolve(undefined),
        ]);
        const result = operation({
          draftCount,
          drafts: new Map(drafts.map((d) => [d.id, d])),
          photos: new Map(photos.map(({ group_key: _, ...p }) => [p.id, p])),
          attempts: new Map(attempts.map((a) => [a.draftId, a])),
          tx,
          blob,
        });
        await finished;
        if (!scope.noPhotos && !scope.itemPhotos && !scope.photoId) {
          const live = new Set(photos.map((p) => p.id));
          for (const [id, url] of this.urls)
            if (!live.has(id)) {
              URL.revokeObjectURL(url);
              this.urls.delete(id);
              this.urlRevisions.delete(id);
            }
        }
        return result;
      } catch (error) {
        try {
          tx.abort();
        } catch {}
        throw error;
      }
    } catch (error) {
      throw storageError(error);
    }
  }
  private row(data: Snapshot, id: string) {
    const row = data.drafts.get(id);
    if (!row)
      throw localDraftError(
        "draft_not_found",
        "This item is no longer saved in this browser.",
        404,
      );
    return row;
  }
  private saveRow(data: Snapshot, row: Row, inputChanged = false) {
    row.version++;
    if (inputChanged) row.input_version++;
    row.updated_at = new Date().toISOString();
    data.tx.objectStore("drafts").put(row);
  }
  private putPhoto(data: Snapshot, photo: DraftPhoto) {
    data.tx
      .objectStore("photos")
      .put({ ...photo, group_key: photo.draft_id || "" });
  }
  private view(data: Snapshot, row: Row): Draft {
    const { created_at: _, ...draft } = row;
    return {
      ...draft,
      photos: [...data.photos.values()]
        .filter((p) => p.draft_id === row.id)
        .sort(
          (a, b) =>
            a.position - b.position ||
            a.created_at.localeCompare(b.created_at) ||
            a.id.localeCompare(b.id),
        ),
    };
  }
  private async hydrate<T extends Draft | DraftLibrary>(value: T): Promise<T> {
    const photos =
      "drafts" in value
        ? [...value.drafts.flatMap((d) => d.photos), ...value.imports]
        : value.photos;
    const missing = photos.filter((p) => {
      if (
        this.urls.has(p.id) &&
        this.urlRevisions.get(p.id) === (p.revision || 0)
      )
        return false;
      const oldUrl = this.urls.get(p.id);
      if (oldUrl) URL.revokeObjectURL(oldUrl);
      this.urls.delete(p.id);
      this.urlRevisions.delete(p.id);
      return true;
    });
    if (missing.length) {
      const files = await this.photoFiles(missing.map((p) => p.id));
      if (this.disposed) return value;
      missing.forEach((p, index) => {
        if (!this.urls.has(p.id)) {
          this.urls.set(p.id, URL.createObjectURL(files[index]));
          this.urlRevisions.set(p.id, p.revision || 0);
        }
      });
    }
    photos.forEach((p) => {
      p.url = this.urls.get(p.id);
    });
    return value;
  }
  async photoFiles(ids: string[]): Promise<Blob[]> {
    try {
      const db = await this.open();
      const tx = db.transaction("blobs", "readonly");
      const rows = await Promise.all(
        ids.map((id) =>
          request<{ id: string; blob: Blob } | undefined>(
            tx.objectStore("blobs").get(id),
          ),
        ),
      );
      if (rows.some((r) => !r?.blob))
        throw localDraftError(
          "photo_not_found",
          "This photo is no longer saved in this browser.",
          404,
        );
      return rows.map((row) => row!.blob);
    } catch (error) {
      throw storageError(error);
    }
  }
  async list(
    state: "draft" | "done" = "draft",
    cursor?: string,
  ): Promise<DraftLibrary> {
    const data = await this.transact(
      "readonly",
      (data) => {
        const rows = [...data.drafts.values()]
          .filter((d) => d.state === state)
          .sort(
            (a, b) =>
              b.created_at.localeCompare(a.created_at) ||
              b.id.localeCompare(a.id),
          );
        return {
          drafts: rows.slice(0, 30).map((d) => this.view(data, d)),
          imports: [...data.photos.values()]
            .filter((p) => !p.draft_id)
            .sort((a, b) => a.created_at.localeCompare(b.created_at)),
          nextCursor: rows.length > 30 ? rows[29].id : null,
        };
      },
      { page: { state, cursor } },
    );
    return this.hydrate(data);
  }
  async action(
    action: string,
    raw: Record<string, unknown> = {},
  ): Promise<Draft> {
    const input = validateDraftAction(action, raw);
    const removed: string[] = [];
    const result = await this.transact(
      action === "detail" ? "readonly" : "readwrite",
      (data) => {
        if (action === "create") {
          const id = input.id || crypto.randomUUID();
          const existing = data.drafts.get(id);
          if (existing) return this.view(data, existing);
          if (data.draftCount >= DRAFT_LIMITS.drafts)
            throw localDraftError(
              "draft_limit",
              "You have 500 saved items. Delete unused items to make space.",
            );
          const photoIds: string[] = input.photoIds || [];
          const photos = photoIds.map((id) => data.photos.get(id));
          if (photos.some((p) => !p || p.draft_id))
            throw localDraftError(
              "photo_not_found",
              "Choose photos that have not been grouped yet.",
            );
          const now = new Date().toISOString();
          const row: Row = {
            id,
            title: "",
            description: "",
            settings: normalizeDraftSettings(
              input.settings || DEFAULT_DRAFT_SETTINGS,
            ),
            state: "draft",
            version: 1,
            input_version: 1,
            operation_id: null,
            operation_state: "idle",
            created_at: now,
            updated_at: now,
          };
          data.drafts.set(id, row);
          data.tx.objectStore("drafts").add(row);
          photos.forEach((photo, position) => {
            photo!.draft_id = id;
            photo!.position = position;
            this.putPhoto(data, photo!);
          });
          return this.view(data, row);
        }
        if (action === "removePhoto") {
          const photo = data.photos.get(input.photoId);
          if (!photo)
            throw localDraftError(
              "photo_not_found",
              "This photo is no longer available.",
              404,
            );
          if (photo.draft_id) {
            const row = this.row(data, photo.draft_id);
            editable(row);
            this.saveRow(data, row, true);
          }
          data.tx.objectStore("photos").delete(photo.id);
          data.tx.objectStore("blobs").delete(photo.id);
          removed.push(photo.id);
          return { deleted: true } as unknown as Draft;
        }
        const row = this.row(data, input.draftId);
        if (action === "detail") return this.view(data, row);
        if (input.expectedVersion !== row.version) throw conflict();
        if (action === "delete") {
          for (const p of data.photos.values())
            if (p.draft_id === row.id) {
              data.tx.objectStore("photos").delete(p.id);
              data.tx.objectStore("blobs").delete(p.id);
              removed.push(p.id);
            }
          data.tx.objectStore("drafts").delete(row.id);
          data.tx.objectStore("attempts").delete(row.id);
          return { deleted: true } as unknown as Draft;
        }
        editable(row);
        if (action === "save") {
          const changed =
            input.settings !== undefined &&
            JSON.stringify(normalizeDraftSettings(input.settings)) !==
              JSON.stringify(normalizeDraftSettings(row.settings));
          for (const key of ["title", "description", "state"] as const)
            if (input[key] !== undefined) row[key] = input[key];
          if (input.settings !== undefined)
            row.settings = normalizeDraftSettings(input.settings);
          this.saveRow(data, row, changed);
        } else if (action === "group") {
          const ids: string[] = input.photoIds;
          const photos = ids.map((id) => data.photos.get(id));
          if (photos.some((p) => !p))
            throw localDraftError(
              "photo_not_found",
              "One of these photos is no longer available.",
            );
          const sources = new Set(
            photos.map((p) => p!.draft_id).filter((id) => id && id !== row.id),
          );
          for (const id of sources) {
            if (!data.drafts.has(id!)) throw conflict();
            const source = this.row(data, id!);
            editable(source);
            if (input.sourceVersions?.[id!] !== source.version)
              throw conflict();
            this.saveRow(data, source, true);
          }
          for (const p of data.photos.values())
            if (p.draft_id === row.id && !ids.includes(p.id)) {
              p.draft_id = null;
              this.putPhoto(data, p);
            }
          photos.forEach((p, position) => {
            p!.draft_id = row.id;
            p!.position = position;
            this.putPhoto(data, p!);
          });
          this.saveRow(data, row, true);
        } else
          throw localDraftError(
            "invalid_draft_request",
            "This draft action is not available.",
            400,
          );
        return this.view(data, row);
      },
      action === "removePhoto"
        ? { photoId: input.photoId }
        : action === "create"
          ? { draftIds: input.id ? [input.id] : [] }
          : action === "group"
            ? {
                draftIds: [
                  input.draftId,
                  ...Object.keys(input.sourceVersions || {}),
                ],
              }
            : { draftIds: [input.draftId], itemPhotos: input.draftId },
    );
    for (const id of removed) {
      const url = this.urls.get(id);
      if (url) URL.revokeObjectURL(url);
      this.urls.delete(id);
      this.urlRevisions.delete(id);
    }
    return "photos" in result ? this.hydrate(result) : result;
  }
  async upload(
    blob: Blob,
    input: { photoId: string; importId: string; draftId?: string },
  ): Promise<DraftPhoto> {
    validateDraftAction("grant", { ...input, bytes: blob.size });
    if (blob.type !== "image/jpeg")
      throw localDraftError("photo_size", "Choose a prepared JPEG photo.");
    const photo = await this.transact(
      "readwrite",
      (data) => {
        const existing = data.photos.get(input.photoId);
        if (existing) {
          if (
            existing.import_id !== input.importId ||
            existing.draft_id !== (input.draftId || null) ||
            existing.bytes !== blob.size
          )
            throw conflict();
          return existing;
        }
        if (
          [...data.photos.values()].reduce(
            (bytes, p) => bytes + p.bytes + (p.original_bytes || 0),
            0,
          ) +
            blob.size >
          DRAFT_LIMITS.storageBytes
        )
          throw localDraftError(
            "storage_limit",
            "Saved photos have reached 512 MB in this browser. Delete unused photos to make space.",
          );
        if (
          [...data.photos.values()].filter(
            (p) => p.import_id === input.importId,
          ).length >= DRAFT_LIMITS.importPhotos
        )
          throw localDraftError(
            "import_limit",
            "One import can have up to 100 photos.",
          );
        let position = 0;
        if (input.draftId) {
          const row = this.row(data, input.draftId);
          editable(row);
          const photos = [...data.photos.values()].filter(
            (p) => p.draft_id === row.id,
          );
          if (photos.length >= DRAFT_LIMITS.photos)
            throw localDraftError(
              "photo_limit",
              "One item can have up to 10 photos.",
            );
          position = Math.max(-1, ...photos.map((p) => p.position)) + 1;
          this.saveRow(data, row, true);
        }
        const photo: DraftPhoto = {
          id: input.photoId,
          import_id: input.importId,
          draft_id: input.draftId || null,
          position,
          bytes: blob.size,
          status: "ready",
          created_at: new Date().toISOString(),
        };
        data.tx
          .objectStore("photos")
          .add({ ...photo, group_key: photo.draft_id || "" });
        data.tx.objectStore("blobs").add({ id: photo.id, blob });
        return photo;
      },
      { draftIds: input.draftId ? [input.draftId] : [] },
    );
    const view = await this.hydrate({
      drafts: [],
      imports: [photo],
      nextCursor: null,
    });
    return view.imports[0];
  }
  /** Preserve one original JPEG and atomically replace only its owned photo. */
  async editPhoto(
    input: { draftId: string; photoId: string; revision: number },
    replacement: Blob | null,
  ): Promise<Draft> {
    if (
      !validDraftId(input.draftId) ||
      !validDraftId(input.photoId) ||
      !Number.isSafeInteger(input.revision) ||
      input.revision < 0
    )
      throw localDraftError(
        "invalid_draft_request",
        "Reopen this photo and try again.",
        400,
      );
    if (
      replacement &&
      (replacement.type !== "image/jpeg" ||
        !replacement.size ||
        replacement.size > DRAFT_LIMITS.uploadBytes)
    )
      throw localDraftError(
        "photo_size",
        "Choose a JPEG photo smaller than 4 MB.",
        400,
      );
    const result = await this.transact(
      "readwrite",
      (data) => {
        const photo = data.photos.get(input.photoId);
        if (
          !photo ||
          photo.draft_id !== input.draftId ||
          photo.status !== "ready" ||
          !data.blob?.blob
        )
          throw localDraftError(
            "photo_not_found",
            "This photo moved or is no longer saved. Reopen the item.",
            404,
          );
        const row = this.row(data, input.draftId);
        editable(row);
        if ((photo.revision || 0) !== input.revision) throw conflict();
        if (!replacement && !data.blob.original) return this.view(data, row);
        const original = data.blob.original || data.blob.blob;
        const blob = replacement || original;
        const originalBytes = replacement ? original.size : 0;
        const usedBytes = [...data.photos.values()].reduce(
          (sum, p) => sum + p.bytes + (p.original_bytes || 0),
          0,
        );
        if (
          usedBytes -
            photo.bytes -
            (photo.original_bytes || 0) +
            blob.size +
            originalBytes >
          DRAFT_LIMITS.storageBytes
        )
          throw localDraftError(
            "storage_limit",
            "This browser's photo storage is full. Delete unused photos and try again.",
          );
        data.tx
          .objectStore("blobs")
          .put({ id: photo.id, blob, ...(replacement ? { original } : {}) });
        photo.bytes = blob.size;
        photo.revision = (photo.revision || 0) + 1;
        if (originalBytes) photo.original_bytes = originalBytes;
        else delete photo.original_bytes;
        this.putPhoto(data, photo);
        this.saveRow(data, row, true);
        return this.view(data, row);
      },
      { draftIds: [input.draftId], blobId: input.photoId },
    );
    return this.hydrate(result);
  }
  async beginAttempt(
    draftId: string,
    attempt: { operationId: string; inputVersion: number },
    batch: boolean,
  ) {
    return this.transact(
      "readwrite",
      (data) => {
        const row = this.row(data, draftId);
        if (row.operation_id === attempt.operationId) {
          const saved = data.attempts.get(draftId);
          if (!saved || saved.inputVersion !== attempt.inputVersion)
            throw conflict();
          return saved;
        }
        editable(row);
        if (row.input_version !== attempt.inputVersion) throw conflict();
        if (![...data.photos.values()].some((p) => p.draft_id === draftId))
          throw localDraftError(
            "photos_not_ready",
            "Add a photo before generating.",
          );
        const saved: LocalDraftAttempt = {
          draftId,
          ...attempt,
          batch,
          createdAt: Date.now(),
        };
        row.operation_id = attempt.operationId;
        row.operation_state = "running";
        this.saveRow(data, row, true);
        data.tx.objectStore("attempts").put(saved);
        return saved;
      },
      { draftIds: [draftId], itemPhotos: draftId, attemptId: draftId },
    );
  }
  async attempt(draftId: string) {
    return this.transact("readonly", (data) => data.attempts.get(draftId), {
      draftIds: [],
      noPhotos: true,
      attemptId: draftId,
    });
  }
  async updateAttempt(attempt: LocalDraftAttempt) {
    await this.transact(
      "readwrite",
      (data) => {
        const row = this.row(data, attempt.draftId);
        if (row.operation_id !== attempt.operationId || !busy(row))
          throw conflict();
        data.tx.objectStore("attempts").put(attempt);
      },
      { draftIds: [attempt.draftId], noPhotos: true },
    );
  }
  async finishAttempt(
    draftId: string,
    operationId: string,
    state: "pending" | "failed" | "succeeded",
    result?: MobileGenerationResult,
  ) {
    await this.transact(
      "readwrite",
      (data) => {
        const row = this.row(data, draftId);
        if (row.operation_id !== operationId) throw conflict();
        if (row.operation_state === "succeeded") return;
        if (result) {
          if (
            !result.title.trim() ||
            result.title.length > 200 ||
            !result.description.trim() ||
            result.description.length > 10000
          )
            throw localDraftError(
              "invalid_result",
              "The generated text could not be saved.",
            );
          row.title = result.title;
          row.description = result.description;
        }
        row.operation_state = state;
        this.saveRow(data, row);
        if (state !== "pending")
          data.tx.objectStore("attempts").delete(draftId);
      },
      { draftIds: [draftId], noPhotos: true },
    );
  }
  dispose() {
    this.disposed = true;
    void this.connection?.then((db) => db.close()).catch(() => {});
    this.urls.forEach((url) => URL.revokeObjectURL(url));
    this.urls.clear();
    this.urlRevisions.clear();
  }
}
