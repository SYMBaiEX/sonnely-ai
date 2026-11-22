export function validOperationsToken(input: string, expected: string | undefined) {
  if (!expected || !/^[a-f0-9]{64}$/.test(expected) || input.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index++)
    difference |= input.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}

export function operationsBearer(header: string | null) {
  return /^Bearer ([a-f0-9]{64})$/i.exec(header ?? "")?.[1] ?? "";
}
