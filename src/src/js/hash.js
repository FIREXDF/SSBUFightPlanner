const crc32 = require('crc-32');

function hash40(text) {
    const lengthShifted = BigInt(text.length) << BigInt(32);
    const crcValue = BigInt(crc32.str(text) >>> 0);
    return (lengthShifted + crcValue).toString(16);
}

function getHash(modName) {
    return BigInt(`0x${hash40(modName)}`).toString();
}

module.exports = {
    getHash
};
