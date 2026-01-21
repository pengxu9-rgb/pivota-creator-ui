export const SHIPPING_COUNTRY_GROUPS: Array<{
  label: string;
  countries: Array<{ code: string; name: string }>;
}> = [
  {
    label: "North America",
    countries: [
      { code: "US", name: "United States" },
      { code: "CA", name: "Canada" },
      { code: "MX", name: "Mexico" },
    ],
  },
  {
    label: "Europe",
    countries: [
      { code: "GB", name: "United Kingdom" },
      { code: "IE", name: "Ireland" },
      { code: "FR", name: "France" },
      { code: "DE", name: "Germany" },
      { code: "ES", name: "Spain" },
      { code: "IT", name: "Italy" },
      { code: "NL", name: "Netherlands" },
      { code: "BE", name: "Belgium" },
      { code: "CH", name: "Switzerland" },
      { code: "AT", name: "Austria" },
      { code: "SE", name: "Sweden" },
      { code: "NO", name: "Norway" },
      { code: "DK", name: "Denmark" },
      { code: "FI", name: "Finland" },
      { code: "PL", name: "Poland" },
      { code: "PT", name: "Portugal" },
    ],
  },
  {
    label: "Asia Pacific",
    countries: [
      { code: "JP", name: "Japan" },
      { code: "KR", name: "South Korea" },
      { code: "SG", name: "Singapore" },
      { code: "HK", name: "Hong Kong" },
      { code: "TW", name: "Taiwan" },
      { code: "CN", name: "China" },
      { code: "IN", name: "India" },
      { code: "AU", name: "Australia" },
      { code: "NZ", name: "New Zealand" },
      { code: "MY", name: "Malaysia" },
      { code: "TH", name: "Thailand" },
      { code: "VN", name: "Vietnam" },
      { code: "ID", name: "Indonesia" },
      { code: "PH", name: "Philippines" },
    ],
  },
  {
    label: "Middle East & Africa",
    countries: [
      { code: "AE", name: "United Arab Emirates" },
      { code: "SA", name: "Saudi Arabia" },
      { code: "IL", name: "Israel" },
      { code: "ZA", name: "South Africa" },
    ],
  },
  {
    label: "South America",
    countries: [
      { code: "BR", name: "Brazil" },
      { code: "AR", name: "Argentina" },
      { code: "CL", name: "Chile" },
      { code: "CO", name: "Colombia" },
    ],
  },
];

const SHIPPING_COUNTRY_CODE_SET = new Set(
  SHIPPING_COUNTRY_GROUPS.flatMap((g) => g.countries.map((c) => String(c.code).toUpperCase())),
);

const SHIPPING_COUNTRY_NAME_TO_CODE = new Map<string, string>(
  SHIPPING_COUNTRY_GROUPS.flatMap((g) =>
    g.countries.flatMap((c) => {
      const code = String(c.code).toUpperCase();
      const name = String(c.name).toUpperCase();
      const compact = name.replace(/[^A-Z]/g, "");
      return [
        [name, code] as const,
        [compact, code] as const,
      ];
    }),
  ),
);

const COUNTRY_ALIASES: Record<string, string> = {
  UK: "GB",
  "UNITED KINGDOM": "GB",
  "GREAT BRITAIN": "GB",
  ENGLAND: "GB",
  SCOTLAND: "GB",
  WALES: "GB",
  "UNITED STATES": "US",
  USA: "US",
  "UNITED STATES OF AMERICA": "US",
  CHINA: "CN",
  PRC: "CN",
  "HONG KONG": "HK",
  HONGKONG: "HK",
  MACAU: "MO",
  "SOUTH KOREA": "KR",
  "KOREA, REPUBLIC OF": "KR",
  KOREA: "KR",
  TAIWAN: "TW",
  VIETNAM: "VN",
  "UNITED ARAB EMIRATES": "AE",
  UAE: "AE",
};

export function normalizeCountryCode(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();

  if (upper.length === 2 && (SHIPPING_COUNTRY_CODE_SET.has(upper) || upper === "ZZ")) {
    return upper;
  }
  if (upper.length === 3 && upper === "USA") return "US";

  const alias = COUNTRY_ALIASES[upper];
  if (alias) return alias;

  const byName = SHIPPING_COUNTRY_NAME_TO_CODE.get(upper);
  if (byName) return byName;

  const compact = upper.replace(/[^A-Z]/g, "");
  const byCompact = SHIPPING_COUNTRY_NAME_TO_CODE.get(compact);
  if (byCompact) return byCompact;

  return null;
}

