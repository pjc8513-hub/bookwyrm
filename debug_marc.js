const fs = require('fs');
const path = require('path');

// Mock DOM things if needed or just paste the class
// The class MarcParser doesn't use DOM, just DataView etc.
// But we need TextDecoder. Node has it globally in newer versions or require 'util'.

class MarcParser {
    constructor() { }

    parse(buffer) {
        const records = [];
        let offset = 0;
        const decoder = new TextDecoder('utf-8');

        while (offset < buffer.byteLength) {
            if (offset + 5 > buffer.byteLength) break;

            const leaderBytes = new Uint8Array(buffer, offset, 24);
            const leaderStr = decoder.decode(leaderBytes);
            const recordLength = parseInt(leaderStr.substring(0, 5), 10);

            if (isNaN(recordLength) || recordLength <= 0) break;
            if (offset + recordLength > buffer.byteLength) break;

            const recordBuffer = buffer.slice(offset, offset + recordLength);
            records.push(this.parseRecord(recordBuffer, decoder));

            offset += recordLength;
        }
        return records;
    }

    parseRecord(buffer, decoder) {
        // ... abbreviated logic based on file content ...
        // I will copy the minimal needed logic or the whole thing if possible
        // Actually, let's just implement the logic directly from the view_file for 001

        const leaderBytes = new Uint8Array(buffer, 0, 24);
        const leader = decoder.decode(leaderBytes);
        const baseAddress = parseInt(leader.substring(12, 17), 10);
        const directoryEnd = baseAddress - 1;
        const directoryEntries = [];

        for (let i = 24; i < directoryEnd; i += 12) {
            if (buffer.byteLength < i + 12) break;
            if (new Uint8Array(buffer, i, 1)[0] === 0x1E) break;

            const entryBytes = new Uint8Array(buffer, i, 12);
            const entryStr = decoder.decode(entryBytes);
            const tag = entryStr.substring(0, 3);
            const length = parseInt(entryStr.substring(3, 7), 10);
            const start = parseInt(entryStr.substring(7, 12), 10);
            directoryEntries.push({ tag, length, start });
        }

        const fields = [];
        const baseDataOffset = baseAddress;

        directoryEntries.forEach(entry => {
            const fieldStart = baseDataOffset + entry.start;
            const fieldEnd = fieldStart + entry.length;
            const fieldBytes = new Uint8Array(buffer, fieldStart, entry.length);
            let effectiveLength = entry.length;
            if (fieldBytes[effectiveLength - 1] === 0x1E) effectiveLength--;

            const contentBytes = new Uint8Array(buffer, fieldStart, effectiveLength);
            const content = decoder.decode(contentBytes);

            fields.push({
                tag: entry.tag,
                value: content,
                isControlField: parseInt(entry.tag, 10) < 10
            });
        });

        return { fields: fields.map(f => this.processField(f)) };
    }

    processField(field) {
        if (field.isControlField) {
            return { tag: field.tag, text: field.value };
        } else {
            // Data field logic ...
            const ind1 = field.value.substring(0, 1);
            const ind2 = field.value.substring(1, 2);
            const rawSubfields = field.value.substring(2);
            const subfields = [];
            const chunks = rawSubfields.split('\x1F');
            chunks.forEach((chunk, index) => {
                if (index === 0 && chunk === '') return;
                if (chunk.length > 0) {
                    const code = chunk.substring(0, 1);
                    const data = chunk.substring(1);
                    subfields.push({ code, data });
                }
            });
            return { tag: field.tag, ind1, ind2, subfields };
        }
    }
}

const buffer = fs.readFileSync('data/test.mrc');
const parser = new MarcParser();
// We need an ArrayBuffer for the parser as written, or it handles Buffer?
// Node Buffer is Uint8Array but underlying buffer property helps.
// The parser uses new Uint8Array(buffer, offset, ...) which expects ArrayBuffer.
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const records = parser.parse(arrayBuffer);
if (records.length > 0) {
    const f001 = records[0].fields.find(f => f.tag === '001');
    console.log('Record 1 Field 001:', JSON.stringify(f001, null, 2));
} else {
    console.log('No records found');
}
