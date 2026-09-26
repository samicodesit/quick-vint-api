import { BrowserMultiFormatReader } from "@zxing/browser";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";

type NativeDetector = {
  detect(video: HTMLVideoElement): Promise<Array<{ rawValue: string }>>;
};
type NativeDetectorConstructor = new (options?: {
  formats?: string[];
}) => NativeDetector;

export function Scanner({
  onCode,
  disabled = false,
}: {
  onCode: (code: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const [camera, setCamera] = useState(false);
  const [message, setMessage] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<() => void>(() => {});
  const callback = useRef(onCode);
  callback.current = onCode;
  useEffect(() => () => stopRef.current(), []);

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia || !video.current) {
      setMessage(
        "Camera access is unavailable. Type or scan the code into the field.",
      );
      return;
    }
    setCamera(true);
    setMessage("");
    try {
      const Native = (
        globalThis as typeof globalThis & {
          BarcodeDetector?: NativeDetectorConstructor;
        }
      ).BarcodeDetector;
      if (Native) {
        let detector: NativeDetector;
        try {
          detector = new Native();
        } catch {
          await startFallback();
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        video.current.srcObject = stream;
        await video.current.play();
        let stopped = false;
        let emptyFrames = 0;
        let timer: ReturnType<typeof setTimeout>;
        stopRef.current = () => {
          stopped = true;
          clearTimeout(timer);
          stream.getTracks().forEach((track) => track.stop());
          if (video.current) video.current.srcObject = null;
        };
        const scan = async () => {
          if (stopped || !video.current) return;
          try {
            const found = await detector.detect(video.current);
            if (found[0]?.rawValue) {
              stopRef.current();
              setCamera(false);
              callback.current(found[0].rawValue);
              return;
            }
            emptyFrames += 1;
            if (emptyFrames >= 40) {
              stopRef.current();
              void startFallback();
              return;
            }
          } catch {
            stopRef.current();
            setCamera(false);
            void startFallback();
            return;
          }
          timer = setTimeout(scan, 120);
        };
        void scan();
        return;
      }
      await startFallback();
    } catch {
      setCamera(false);
      setMessage(
        "Camera could not start. Type or scan the code into the field.",
      );
    }
  }

  async function startFallback() {
    if (!video.current) return;
    try {
      const reader = new BrowserMultiFormatReader();
      let controls: { stop(): void } | null = null;
      let detected = false;
      controls = await reader.decodeFromVideoDevice(
        undefined,
        video.current,
        (result) => {
          if (result && !detected) {
            detected = true;
            controls?.stop();
            setCamera(false);
            callback.current(result.getText());
          }
        },
      );
      if (detected) controls.stop();
      stopRef.current = () => controls.stop();
      if (!detected) setCamera(true);
    } catch {
      setCamera(false);
      setMessage(
        "Camera decoding failed. Type or scan the code into the field.",
      );
    }
  }

  return (
    <div className="ops-scanner">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim() && !disabled) {
            callback.current(value.trim());
            setValue("");
          }
        }}
      >
        <label>
          Item or location code
          <input
            autoComplete="off"
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <button disabled={disabled || !value.trim()}>Look up code</button>
      </form>
      <button
        type="button"
        onClick={
          camera
            ? () => {
                stopRef.current();
                setCamera(false);
              }
            : startCamera
        }
      >
        {camera ? "Stop camera" : "Use camera"}
      </button>
      <video
        ref={video}
        playsInline
        muted
        aria-label="Camera preview"
        hidden={!camera}
      />
      {message && <p role="status">{message}</p>}
    </div>
  );
}

export function PrintLabel({ code, label }: { code: string; label: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(code, {
      margin: 1,
      width: 240,
      errorCorrectionLevel: "M",
    }).then((data) => {
      if (active) setSrc(data);
    });
    return () => {
      active = false;
    };
  }, [code]);
  return (
    <div className="ops-label-wrap">
      <div className="ops-label">
        <strong>{label}</strong>
        {src && <img src={src} alt={`Lookup QR for ${label}`} />}
        <small>{code}</small>
      </div>
      <button type="button" onClick={() => window.print()}>
        Print label
      </button>
    </div>
  );
}
