import type { ShippingAddress } from "@/lib/accountsClient";

const STORAGE_KEY = "pivota_default_shipping_address_v1";

export function loadSavedShippingAddress(): ShippingAddress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ShippingAddress;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveShippingAddress(address: ShippingAddress): void {
  if (typeof window === "undefined") return;
  try {
    const payload: ShippingAddress = {
      name: address.name ?? "",
      address_line1: address.address_line1 ?? "",
      address_line2: address.address_line2 ?? "",
      city: address.city ?? "",
      province: address.province ?? "",
      country: address.country ?? "",
      postal_code: address.postal_code ?? "",
      phone: address.phone ?? "",
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Best-effort only; ignore storage errors.
  }
}

export function hasNonEmptyAddress(
  address: ShippingAddress | null | undefined,
): boolean {
  if (!address) return false;
  return Boolean(
    address.name ||
      address.address_line1 ||
      address.city ||
      address.province ||
      address.country ||
      address.postal_code ||
      address.phone,
  );
}
