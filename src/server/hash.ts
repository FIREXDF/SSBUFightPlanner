import * as crc32 from 'crc-32';

function hash40(text: string): string {
  const lengthShifted = BigInt(text.length) << BigInt(32);
  const crcValue = BigInt(crc32.str(text) >>> 0);
  return (lengthShifted + crcValue).toString(16);
}

function getHash(modName: string): string {
  return BigInt(`0x${hash40(modName)}`).toString();
}

export { getHash };
