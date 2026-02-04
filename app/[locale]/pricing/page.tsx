import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { PricingClient } from "./PricingClient";

// Required for static export
export const dynamic = 'force-static';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta.pricing" });

  return {
    title: t("title"),
    description: t("description"),
    openGraph: {
      title: t("ogTitle"),
      description: t("ogDescription"),
    },
    alternates: {
      canonical: locale === "en" ? "/pricing/" : `/${locale}/pricing/`,
      languages: {
        en: "/pricing/",
        fr: "/fr/pricing/",
        de: "/de/pricing/",
      },
    },
  };
}

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await params;
  const t = await getTranslations();

  return (
    <div className="pricing-page-content" id="pricing">
      <h1 className="pricing-h1">{t("pricing.title")}</h1>
      <p className="subtitle">{t("pricing.subtitle")}</p>

      <div className="pricing-grid">
        {/* Free Trial */}
        <div className="pricing-card">
          <div className="plan-name">{t("pricing.free.name")}</div>
          <div className="plan-description">
            {t("pricing.free.description")}
          </div>
          <div className="plan-price">
            {t("pricing.free.price")}
            <span className="period">{t("pricing.free.period")}</span>
          </div>

          <div className="limits-section">
            <div className="limits-title">{t("pricing.free.limits.title")}</div>
            <ul className="limits-list">
              <li>{t("pricing.free.limits.daily")}</li>
              <li>{t("pricing.free.limits.monthly")}</li>
              <li>{t("pricing.free.limits.trial")}</li>
            </ul>
          </div>

          <ul className="features-list">
            <li>{t("pricing.free.features.0")}</li>
            <li>{t("pricing.free.features.1")}</li>
            <li>{t("pricing.free.features.2")}</li>
          </ul>

          <PricingClient plan="free" />
        </div>

        {/* Starter */}
        <div className="pricing-card popular">
          <div className="popular-badge">{t("pricing.starter.popular")}</div>
          <div className="plan-name">{t("pricing.starter.name")}</div>
          <div className="plan-description">
            {t("pricing.starter.description")}
          </div>
          <div className="plan-price">
            {t("pricing.starter.price")}
            <span className="period">{t("pricing.starter.period")}</span>
          </div>

          <div className="limits-section">
            <div className="limits-title">
              {t("pricing.starter.limits.title")}
            </div>
            <ul className="limits-list">
              <li>{t("pricing.starter.limits.daily")}</li>
              <li>{t("pricing.starter.limits.monthly")}</li>
            </ul>
          </div>

          <ul className="features-list">
            <li>{t("pricing.starter.features.0")}</li>
            <li>{t("pricing.starter.features.1")}</li>
            <li>{t("pricing.starter.features.2")}</li>
            <li>{t("pricing.starter.features.3")}</li>
          </ul>

          <PricingClient plan="starter" />
        </div>

        {/* Pro */}
        <div className="pricing-card">
          <div className="plan-name">{t("pricing.pro.name")}</div>
          <div className="plan-description">{t("pricing.pro.description")}</div>
          <div className="plan-price">
            {t("pricing.pro.price")}
            <span className="period">{t("pricing.pro.period")}</span>
          </div>

          <div className="limits-section">
            <div className="limits-title">{t("pricing.pro.limits.title")}</div>
            <ul className="limits-list">
              <li>{t("pricing.pro.limits.daily")}</li>
              <li>{t("pricing.pro.limits.monthly")}</li>
            </ul>
          </div>

          <ul className="features-list">
            <li>{t("pricing.pro.features.0")}</li>
            <li>{t("pricing.pro.features.1")}</li>
            <li>{t("pricing.pro.features.2")}</li>
          </ul>

          <PricingClient plan="pro" />
        </div>

        {/* Business */}
        <div className="pricing-card">
          <div className="plan-name">{t("pricing.business.name")}</div>
          <div className="plan-description">
            {t("pricing.business.description")}
          </div>
          <div className="plan-price">
            {t("pricing.business.price")}
            <span className="period">{t("pricing.business.period")}</span>
          </div>

          <div className="limits-section">
            <div className="limits-title">
              {t("pricing.business.limits.title")}
            </div>
            <ul className="limits-list">
              <li>{t("pricing.business.limits.daily")}</li>
              <li>{t("pricing.business.limits.monthly")}</li>
            </ul>
          </div>

          <ul className="features-list">
            <li>{t("pricing.business.features.0")}</li>
            <li>{t("pricing.business.features.1")}</li>
            <li>{t("pricing.business.features.2")}</li>
          </ul>

          <PricingClient plan="business" />
        </div>
      </div>

      {/* FAQ Section */}
      <div
        style={{ maxWidth: "800px", margin: "4rem auto", padding: "0 20px" }}
      >
        <h2 style={{ textAlign: "center", marginBottom: "2rem" }}>
          {t("pricing.faq.title")}
        </h2>
        <div
          style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
        >
          <div
            style={{
              background: "#f9fafb",
              padding: "1.5rem",
              borderRadius: "12px",
            }}
          >
            <h3 style={{ marginBottom: "0.5rem", fontSize: "1.1rem" }}>
              {t("pricing.faq.q1.question")}
            </h3>
            <p style={{ color: "#6b7280" }}>{t("pricing.faq.q1.answer")}</p>
          </div>
          <div
            style={{
              background: "#f9fafb",
              padding: "1.5rem",
              borderRadius: "12px",
            }}
          >
            <h3 style={{ marginBottom: "0.5rem", fontSize: "1.1rem" }}>
              {t("pricing.faq.q2.question")}
            </h3>
            <p style={{ color: "#6b7280" }}>{t("pricing.faq.q2.answer")}</p>
          </div>
          <div
            style={{
              background: "#f9fafb",
              padding: "1.5rem",
              borderRadius: "12px",
            }}
          >
            <h3 style={{ marginBottom: "0.5rem", fontSize: "1.1rem" }}>
              {t("pricing.faq.q3.question")}
            </h3>
            <p style={{ color: "#6b7280" }}>{t("pricing.faq.q3.answer")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
