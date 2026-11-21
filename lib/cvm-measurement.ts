type MeasurementEvent = {
  imr: number;
  event_type: number;
  event: string;
  event_payload: string;
  digest: string;
};

export const normalizeHex = (value: string) => value.replace(/^0x/i, "").toLowerCase();
const toHex = (value: Uint8Array) => [...value].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const fromHex = (value: string) =>
  Uint8Array.from(value.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));

async function sha(algorithm: "SHA-256" | "SHA-384", ...parts: Uint8Array[]) {
  const bytes = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return new Uint8Array(await crypto.subtle.digest(algorithm, bytes));
}

export async function verifyCvmMeasurement(
  compose: string,
  expectedCompose: string,
  expectedApp: string,
  expectedInstance: string,
  signedRtmr3: string,
  events: MeasurementEvent[],
) {
  const text = new TextEncoder();
  const expected = normalizeHex(expectedCompose);
  if (toHex(await sha("SHA-256", text.encode(compose))) !== expected) return false;
  const lane = events.filter(({ imr }) => imr === 3);
  const boot = lane.findIndex(({ event }) => event === "boot-mr-done");
  if (boot === -1) return false;
  const claims = [
    ["app-id", normalizeHex(expectedApp)],
    ["compose-hash", expected],
    ["instance-id", normalizeHex(expectedInstance)],
  ];
  for (const [name, value] of claims) {
    const claimant = lane.findIndex(({ event }) => event === name);
    if (
      claimant < 0 ||
      claimant >= boot ||
      normalizeHex(lane[claimant].event_payload) !== value ||
      lane.findLastIndex(({ event }) => event === name) !== claimant
    )
      return false;
  }

  // Dstack V1 runtime events hash the little-endian type, name, and payload.
  // Recompute both that digest and the subsequent extension into RTMR3.
  let measurement: Uint8Array = new Uint8Array(48);
  for (const event of lane) {
    const payload = normalizeHex(event.event_payload);
    if (event.event_type !== 0x08000001 || !/^(?:[0-9a-f]{2})*$/.test(payload)) return false;
    const type = new Uint8Array(4);
    new DataView(type.buffer).setUint32(0, event.event_type, true);
    const digest = await sha("SHA-384", type, text.encode(":" + event.event + ":"), fromHex(payload));
    if (toHex(digest) !== normalizeHex(event.digest)) return false;
    measurement = await sha("SHA-384", measurement, digest);
  }
  return toHex(measurement) === normalizeHex(signedRtmr3);
}
