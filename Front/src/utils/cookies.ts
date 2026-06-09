export function setCookie(name: string, value: string, days: number): void {
  const expires = days
    ? `; max-age=${days * 24 * 60 * 60}`
    : "";
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(
    value
  )}${expires}; path=/; SameSite=Lax`;
}

export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const nameEQ = encodeURIComponent(name) + "=";
  const ca = document.cookie.split(";");
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === " ") c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) {
      return decodeURIComponent(c.substring(nameEQ.length, c.length));
    }
  }
  return null;
}

export function deleteCookie(name: string): void {
  document.cookie = `${encodeURIComponent(
    name
  )}=; max-age=0; path=/; SameSite=Lax`;
}

