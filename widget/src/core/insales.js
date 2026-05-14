export async function getInsalesClient() {
  try {
    const response = await fetch("/client_account/contacts.json", {
      credentials: "include",
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    const client = payload?.client || payload;
    if (!client?.id) {
      return null;
    }

    return {
      id: String(client.id),
      email: client.email || "",
      phone: client.phone || "",
      name: client.name || client.contact_name || "",
    };
  } catch {
    return null;
  }
}
