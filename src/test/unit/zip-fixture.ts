import * as zlib from 'zlib';

/**
 * Minimal ZIP writer used by the unzip regression test. It avoids pulling in a
 * zip-writing dependency and lets the test control the exact shape of the
 * archive (large deflate entry + small entries + directory entries) that
 * reproduces the streaming-inflate hang. Sizes are written into the local
 * headers (no data descriptor), so yauzl reads it without ambiguity.
 */

export interface ZipEntry {
    /** Entry name; a trailing '/' marks a directory entry. */
    name: string;
    /** Uncompressed contents; omitted/empty for directories. */
    data?: Buffer;
}

const CRC_TABLE: Int32Array = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c;
    }
    return table;
})();

export function crc32(buf: Buffer): number {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
}

export function buildZip(entries: ZipEntry[]): Buffer {
    const locals: Buffer[] = [];
    const central: Buffer[] = [];
    let offset = 0;
    const DOS_TIME = 0;
    const DOS_DATE = 0x21; // 1980-01-01

    for (const entry of entries) {
        const nameBuf = Buffer.from(entry.name, 'utf8');
        const isDir = entry.name.endsWith('/');
        const raw = isDir ? Buffer.alloc(0) : (entry.data ?? Buffer.alloc(0));
        const method = isDir || raw.length === 0 ? 0 : 8; // stored for dir/empty, deflate otherwise
        const comp = method === 8 ? zlib.deflateRawSync(raw) : raw;
        const crc = crc32(raw);

        const lfh = Buffer.alloc(30);
        lfh.writeUInt32LE(0x04034b50, 0);
        lfh.writeUInt16LE(20, 4);            // version needed
        lfh.writeUInt16LE(0, 6);             // flags (0 => sizes live in the header)
        lfh.writeUInt16LE(method, 8);
        lfh.writeUInt16LE(DOS_TIME, 10);
        lfh.writeUInt16LE(DOS_DATE, 12);
        lfh.writeUInt32LE(crc, 14);
        lfh.writeUInt32LE(comp.length, 18);
        lfh.writeUInt32LE(raw.length, 22);
        lfh.writeUInt16LE(nameBuf.length, 26);
        lfh.writeUInt16LE(0, 28);            // extra length
        locals.push(lfh, nameBuf, comp);

        const cdh = Buffer.alloc(46);
        cdh.writeUInt32LE(0x02014b50, 0);
        cdh.writeUInt16LE(20, 4);            // version made by
        cdh.writeUInt16LE(20, 6);            // version needed
        cdh.writeUInt16LE(0, 8);             // flags
        cdh.writeUInt16LE(method, 10);
        cdh.writeUInt16LE(DOS_TIME, 12);
        cdh.writeUInt16LE(DOS_DATE, 14);
        cdh.writeUInt32LE(crc, 16);
        cdh.writeUInt32LE(comp.length, 20);
        cdh.writeUInt32LE(raw.length, 24);
        cdh.writeUInt16LE(nameBuf.length, 28);
        cdh.writeUInt16LE(0, 30);            // extra
        cdh.writeUInt16LE(0, 32);            // comment
        cdh.writeUInt16LE(0, 34);            // disk start
        cdh.writeUInt16LE(0, 36);            // internal attrs
        cdh.writeUInt32LE(isDir ? 0x10 : 0, 38); // external attrs
        cdh.writeUInt32LE(offset, 42);       // local header offset
        central.push(cdh, nameBuf);

        offset += lfh.length + nameBuf.length + comp.length;
    }

    const centralBuf = Buffer.concat(central);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);                // disk number
    eocd.writeUInt16LE(0, 6);                // disk with central dir start
    eocd.writeUInt16LE(entries.length, 8);   // entries on this disk
    eocd.writeUInt16LE(entries.length, 10);  // total entries
    eocd.writeUInt32LE(centralBuf.length, 12);
    eocd.writeUInt32LE(offset, 16);          // central dir offset
    eocd.writeUInt16LE(0, 20);               // comment length

    return Buffer.concat([...locals, centralBuf, eocd]);
}
