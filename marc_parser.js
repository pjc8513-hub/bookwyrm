/**
 * Simple MARC21 Binary Parser
 * This is a minimal implementation to parse ISO 2709 records.
 */

class MarcParser {
    constructor() {}

    /**
     * Parses a binary string or ArrayBuffer of a MARC file containing one or more records.
     * @param {ArrayBuffer} buffer 
     * @returns {Array<Object>} Array of parsed records
     */
    parse(buffer) {
        const records = [];
        let offset = 0;
        const view = new DataView(buffer);
        const decoder = new TextDecoder('utf-8'); // Assuming UTF-8, though MARC8 is possible. 
        // For modern ILS exports, UTF-8 is standard (Leader char 9 = 'a'). 
        // We will assume UTF-8 for this prototype.

        while (offset < buffer.byteLength) {
            // Read Record Length (first 5 bytes)
            if (offset + 5 > buffer.byteLength) break;
            
            const leaderBytes = new Uint8Array(buffer, offset, 24);
            const leaderStr = decoder.decode(leaderBytes);
            const recordLength = parseInt(leaderStr.substring(0, 5), 10);
            
            if (isNaN(recordLength) || recordLength <= 0) {
                console.error("Invalid record length at offset " + offset);
                break;
            }

            if (offset + recordLength > buffer.byteLength) {
                console.warn("Incomplete record at end of file");
                break;
            }

            const recordBuffer = buffer.slice(offset, offset + recordLength);
            records.push(this.parseRecord(recordBuffer, decoder));
            
            offset += recordLength;
        }

        return records;
    }

    parseRecord(buffer, decoder) {
        const view = new DataView(buffer);
        
        // Leader
        const leaderBytes = new Uint8Array(buffer, 0, 24);
        const leader = decoder.decode(leaderBytes);
        
        // Base Address of Data
        const baseAddress = parseInt(leader.substring(12, 17), 10);
        
        // directory
        // Ends with field terminator (0x1E)
        // Each entry is 12 bytes: Tag (3), Field Length (4), Starting Character Position (5)
        const directoryEnd = baseAddress - 1; 
        const directoryEntries = [];
        
        for (let i = 24; i < directoryEnd; i += 12) {
            if (buffer.byteLength < i + 12) break; // Safety
            
            // Check for terminator
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
            
            // The field content usually ends with a field terminator 0x1E, 
            // but the length includes it. 
            // We want to slice safely.
            const fieldBytes = new Uint8Array(buffer, fieldStart, entry.length);
            
            // Remove terminator if present at the end
            let effectiveLength = entry.length;
            if (fieldBytes[effectiveLength - 1] === 0x1E) {
                effectiveLength--;
            }

            const contentBytes = new Uint8Array(buffer, fieldStart, effectiveLength);
            const content = decoder.decode(contentBytes);

            fields.push({
                tag: entry.tag,
                value: content,
                isControlField: parseInt(entry.tag, 10) < 10
            });
        });

        // structure the output for easier usage
        const parsedRecord = {
            leader: leader,
            fields: fields.map(f => this.processField(f))
        };

        return parsedRecord;
    }

    processField(field) {
        if (field.isControlField) {
            return { tag: field.tag, text: field.value };
        } else {
            // Data fields have indicators (2 bytes) and subfields
            // Subfields strictly start with delimiter 0x1F followed by code
            const ind1 = field.value.substring(0, 1);
            const ind2 = field.value.substring(1, 2);
            const rawSubfields = field.value.substring(2);
            
            const subfields = [];
            // Split by 0x1F (Unit Separator)
            // Note: JS strings handle this character fine usually.
            const chunks = rawSubfields.split('\x1F');
            
            // Key assumption: The first chunk might be empty if the string starts with 0x1F
            chunks.forEach((chunk, index) => {
                if (index === 0 && chunk === '') return; // Skip leading empty split if starts with delimiter
                if (chunk.length > 0) {
                    const code = chunk.substring(0, 1);
                    const data = chunk.substring(1);
                    subfields.push({ code, data });
                }
            });

            return {
                tag: field.tag,
                ind1,
                ind2,
                subfields
            };
        }
    }
}
