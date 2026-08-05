/**
 * CRM の連絡先と Google 連絡先の項目対応。
 *
 * **変換の判断はここに集める。** freee で Server Action の中に組み立てを
 * 書いていたせいで型もテストも効かず、送れない項目を混ぜて 400 を食らった
 * （2026-08-05）。同じ轍を踏まないよう、純粋関数にしてテストで仕様を固定する。
 *
 * 対応表の正本は docs/google-contacts-sync.md §4。**片方だけ直さないこと。**
 */

import { CLIENT_DATA_KEY } from "./config";
import type { GooglePerson } from "./client";

// ---------------------------------------------------------------------------
// CRM 側の入力（DB 関数 get_contact_google_source が返す形）
// ---------------------------------------------------------------------------

export type ContactEmail = { email: string; label: string; is_primary: boolean };
export type ContactPhone = { phone: string; label: string; is_primary: boolean };
export type ContactAddress = {
  label: string;
  is_primary: boolean;
  postal_code: string | null;
  prefecture: string | null;
  city: string | null;
  address_line1: string | null;
  address_line2: string | null;
};

export type ContactSource = {
  contact_id: string;
  contact_code: string;
  last_name: string;
  middle_name: string | null;
  first_name: string;
  last_name_kana: string | null;
  middle_name_kana: string | null;
  first_name_kana: string | null;
  company_name: string | null;
  department: string | null;
  job_title: string | null;
  /** yyyy-mm-dd。CRM は DATE なので年が必ずある */
  birth_date: string | null;
  emails: ContactEmail[];
  phones: ContactPhone[];
  addresses: ContactAddress[];
};

// ---------------------------------------------------------------------------
// ラベルの対応（§4.2〜4.4）
// ---------------------------------------------------------------------------

const EMAIL_LABEL_TO_GOOGLE: Record<string, string> = {
  work: "work",
  personal: "home",
  other: "other",
};

/** Google 側はカスタム値も入るため、知らない type は other に寄せる */
export function emailTypeToCrm(type: string | undefined): string {
  return type === "work" ? "work" : type === "home" ? "personal" : "other";
}

const PHONE_LABEL_TO_GOOGLE: Record<string, string> = {
  work: "work",
  mobile: "mobile",
  home: "home",
  fax: "workFax",
  other: "other",
};

export function phoneTypeToCrm(type: string | undefined): string {
  switch (type) {
    case "work":
    case "main":
      return "work";
    case "mobile":
      return "mobile";
    case "home":
      return "home";
    case "workFax":
    case "homeFax":
    case "otherFax":
    case "fax":
      return "fax";
    default:
      return "other";
  }
}

const ADDRESS_LABEL_TO_GOOGLE: Record<string, string> = {
  main: "work",
  home: "home",
  billing: "other",
  shipping: "other",
  branch: "other",
  other: "other",
};

// ---------------------------------------------------------------------------
// 比較のための正規化
// ---------------------------------------------------------------------------

/** メールは小文字化・前後空白除去で比べる */
export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** 電話は数字だけで比べる（freee の電話比較と同じ） */
export function normalizePhone(value: string | null | undefined): string {
  return (value ?? "").replace(/[^0-9]/g, "");
}

function text(value: string | null | undefined): string | undefined {
  const s = (value ?? "").trim();
  return s === "" ? undefined : s;
}

// ---------------------------------------------------------------------------
// CRM → Google
// ---------------------------------------------------------------------------

/**
 * push する項目。**ここに挙げた項目だけが Google 側で上書きされる。**
 *
 * 写真・メモ・ニックネーム等を含めないのは、利用者がスマホで足した情報を
 * 消さないため（§4.6）。
 */
export const UPDATE_PERSON_FIELDS =
  "names,emailAddresses,phoneNumbers,addresses,organizations,birthdays,clientData";

export function toGooglePerson(source: ContactSource): Partial<GooglePerson> {
  const person: Partial<GooglePerson> = {
    names: [
      {
        familyName: text(source.last_name),
        middleName: text(source.middle_name),
        givenName: text(source.first_name),
        phoneticFamilyName: text(source.last_name_kana),
        phoneticMiddleName: text(source.middle_name_kana),
        phoneticGivenName: text(source.first_name_kana),
      },
    ],
    // 対応付けの刻印。リンク表が壊れても復元できる（§3）
    clientData: [{ key: CLIENT_DATA_KEY, value: source.contact_code }],
  };

  // **主のものを先頭に置く。** Google 側の primary は書き込みで扱いが揺れるため、
  // 並び順で意図を表す
  const emails = [...source.emails].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary)
  );
  if (emails.length > 0) {
    person.emailAddresses = emails.map((e) => ({
      value: e.email,
      type: EMAIL_LABEL_TO_GOOGLE[e.label] ?? "other",
    }));
  }

  const phones = [...source.phones].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary)
  );
  if (phones.length > 0) {
    person.phoneNumbers = phones.map((p) => ({
      value: p.phone,
      type: PHONE_LABEL_TO_GOOGLE[p.label] ?? "other",
    }));
  }

  const addresses = [...source.addresses].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary)
  );
  if (addresses.length > 0) {
    person.addresses = addresses.map((a) => ({
      type: ADDRESS_LABEL_TO_GOOGLE[a.label] ?? "other",
      postalCode: text(a.postal_code),
      region: text(a.prefecture),
      city: text(a.city),
      streetAddress: text(a.address_line1),
      extendedAddress: text(a.address_line2),
    }));
  }

  // 会社名・部署・役職は 1 つの organizations にまとめる。
  // **どれも無ければ organizations 自体を送らない**（空の職歴を作らない）
  const orgName = text(source.company_name);
  const department = text(source.department);
  const title = text(source.job_title);
  if (orgName || department || title) {
    person.organizations = [{ name: orgName, department, title }];
  }

  const birthday = toGoogleBirthday(source.birth_date);
  if (birthday) person.birthdays = [{ date: birthday }];

  return person;
}

/** CRM の DATE（yyyy-mm-dd）→ Google の date。年は必ず入る */
export function toGoogleBirthday(
  value: string | null
): { year: number; month: number; day: number } | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/**
 * 同期対象の項目だけを取り出した指紋。
 *
 * `contact_emails` / `contact_phones` に `updated_at` が無く、親の
 * `updated_at` も子の変更で動く保証が無いため、**内容そのものを比べる**
 * （§5.2）。トリガーを増やすより単純で、取りこぼしが無い。
 */
export function fingerprintSource(source: ContactSource): string {
  const canonical = {
    n: [
      source.last_name,
      source.middle_name ?? "",
      source.first_name,
      source.last_name_kana ?? "",
      source.middle_name_kana ?? "",
      source.first_name_kana ?? "",
    ],
    o: [source.company_name ?? "", source.department ?? "", source.job_title ?? ""],
    b: source.birth_date ?? "",
    // 並び順が変わっただけで push しないよう、正規化して整列する
    e: source.emails
      .map((e) => `${normalizeEmail(e.email)}|${e.label}|${e.is_primary ? 1 : 0}`)
      .sort(),
    p: source.phones
      .map((p) => `${normalizePhone(p.phone)}|${p.label}|${p.is_primary ? 1 : 0}`)
      .sort(),
    a: source.addresses
      .map((a) =>
        [
          a.label,
          a.is_primary ? 1 : 0,
          a.postal_code ?? "",
          a.prefecture ?? "",
          a.city ?? "",
          a.address_line1 ?? "",
          a.address_line2 ?? "",
        ].join("|")
      )
      .sort(),
  };
  return JSON.stringify(canonical);
}

// ---------------------------------------------------------------------------
// Google → CRM（ミラーへ落とす形。取り込みは差分画面で人が確定する）
// ---------------------------------------------------------------------------

export type GoogleContactRow = {
  resource_name: string;
  etag: string | null;
  family_name: string | null;
  middle_name: string | null;
  given_name: string | null;
  family_name_kana: string | null;
  middle_name_kana: string | null;
  given_name_kana: string | null;
  org_name: string | null;
  department: string | null;
  job_title: string | null;
  /** 年が無ければ null（CRM の DATE に入れられない。§4.1） */
  birth_date: string | null;
  /** 年なしで持たれていた場合の表示用（差分画面で「年なし」と示す） */
  birthday_without_year: string | null;
  emails: { email: string; label: string }[];
  phones: { phone: string; label: string }[];
  addresses: {
    label: string;
    postal_code: string | null;
    prefecture: string | null;
    city: string | null;
    address_line1: string | null;
    address_line2: string | null;
  }[];
  client_contact_code: string | null;
  group_resource_names: string[];
  google_deleted: boolean;
};

export function toGoogleContactRow(person: GooglePerson): GoogleContactRow {
  const name = person.names?.[0];
  const org = person.organizations?.[0];
  const birthday = person.birthdays?.find((b) => b.date);

  const hasYear = typeof birthday?.date?.year === "number";
  const pad = (n: number) => String(n).padStart(2, "0");

  return {
    resource_name: person.resourceName,
    etag: person.etag ?? null,
    family_name: text(name?.familyName) ?? null,
    middle_name: text(name?.middleName) ?? null,
    given_name: text(name?.givenName) ?? null,
    family_name_kana: text(name?.phoneticFamilyName) ?? null,
    middle_name_kana: text(name?.phoneticMiddleName) ?? null,
    given_name_kana: text(name?.phoneticGivenName) ?? null,
    org_name: text(org?.name) ?? null,
    department: text(org?.department) ?? null,
    job_title: text(org?.title) ?? null,
    birth_date:
      hasYear && birthday?.date?.month && birthday?.date?.day
        ? `${birthday.date.year}-${pad(birthday.date.month)}-${pad(birthday.date.day)}`
        : null,
    birthday_without_year:
      !hasYear && birthday?.date?.month && birthday?.date?.day
        ? `${pad(birthday.date.month)}-${pad(birthday.date.day)}`
        : null,
    emails: (person.emailAddresses ?? [])
      .filter((e) => text(e.value))
      .map((e) => ({ email: e.value!.trim(), label: emailTypeToCrm(e.type) })),
    phones: (person.phoneNumbers ?? [])
      .filter((p) => text(p.value))
      .map((p) => ({ phone: p.value!.trim(), label: phoneTypeToCrm(p.type) })),
    addresses: (person.addresses ?? []).map((a) => ({
      label: a.type === "home" ? "home" : a.type === "work" ? "main" : "other",
      postal_code: text(a.postalCode) ?? null,
      prefecture: text(a.region) ?? null,
      city: text(a.city) ?? null,
      address_line1: text(a.streetAddress) ?? null,
      address_line2: text(a.extendedAddress) ?? null,
    })),
    client_contact_code:
      person.clientData?.find((d) => d.key === CLIENT_DATA_KEY)?.value ?? null,
    group_resource_names: (person.memberships ?? [])
      .map((m) => m.contactGroupMembership?.contactGroupResourceName)
      .filter((v): v is string => Boolean(v)),
    google_deleted: person.metadata?.deleted === true,
  };
}
