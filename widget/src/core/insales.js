export async function getInsalesClient() {
  try {
    const response = await fetch("/client_account/contacts.json", {
      credentials: "include",
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    if (!payload?.id) {
      return null;
    }

    return {
      id: String(payload.id),
      email: payload.email || "",
      phone: payload.phone || "",
      name: payload.name || "",
    };
  } catch {
    return null;
  }
}
