const fs = require('fs');
const path = require('path');

// Helper to encode string to UTF-8 buffer
function enc(str) {
    return Buffer.from(str, 'utf8');
}

function buildField(tag, ind1, ind2, subfields) {
    // subfields is dict { code: value }
    // or array of {code, value} to preserve order

    let content = '';
    if (parseInt(tag) >= 10) {
        content += ind1 + ind2;
        subfields.forEach(sf => {
            content += '\x1F' + sf.code + sf.value;
        });
        content += '\x1E'; // Field terminator
    } else {
        // Control field
        content = subfields; // treating subfields as raw string for control fields
        content += '\x1E';
    }
    return { tag, content };
}

function buildRecord(fields) {
    // fields: array of { tag, content }

    let directory = Buffer.alloc(0);
    let data = Buffer.alloc(0);

    fields.forEach(f => {
        const fieldData = enc(f.content);
        data = Buffer.concat([data, fieldData]);

        const length = fieldData.length;
        const tag = f.tag;
        // Entry: Tag(3) + FieldLength(4) + StartPos(5)
        // Length and StartPos are numeric strings, zero padded
        // StartPos is relative to Base Address
        // BUT wait, we need to calculate start pos cumulatively.
    });

    // Actually, need to do it in loop to track offsets
    let currentOffset = 0;
    fields.forEach(f => {
        const fieldData = enc(f.content);
        const lenStr = String(fieldData.length).padStart(4, '0');
        const posStr = String(currentOffset).padStart(5, '0');

        directory = Buffer.concat([directory, enc(f.tag + lenStr + posStr)]);

        currentOffset += fieldData.length;
    });

    // Terminator for directory
    directory = Buffer.concat([directory, enc('\x1E')]);

    const baseAddress = 24 + directory.length; // Leader is 24 bytes
    const totalLength = baseAddress + data.length + 1; // +1 for Record Terminator

    // Leader
    // 00-04: Record Length (5 digits)
    // 05: Record Status (n)
    // 06: Type of Record (a)
    // 07: Bibliographic Level (m)
    // 08-09: Control Type (  )
    // 10: Indicator Count (2)
    // 11: Subfield Code Count (2)
    // 12-16: Base Address of Data (5 digits)
    // 17: Encoding Level ( )
    // 18: Descriptive Cataloging Form (a)
    // 19: Multipart Resource Record Level ( )
    // 20-23: Entry Map (4500)

    const lenStr = String(totalLength).padStart(5, '0');
    const baseAddrStr = String(baseAddress).padStart(5, '0');
    const leader = `${lenStr}nam a22${baseAddrStr} a 4500`;

    return Buffer.concat([
        enc(leader),
        directory,
        data,
        enc('\x1D') // Record Terminator
    ]);
}

const records = [
    [
        buildField('001', '', '', '123456'),
        buildField('100', '1', ' ', [{ code: 'a', value: 'Orwell, George' }]),
        buildField('245', '1', '4', [{ code: 'a', value: 'Nineteen Eighty-Four' }]),
        buildField('520', ' ', ' ', [{ code: 'a', value: 'Among the seminal texts of the 20th century, Nineteen Eighty-Four is a rare work that grows frequent.' }]),
        buildField('650', ' ', '0', [{ code: 'a', value: 'Totalitarianism' }, { code: 'x', value: 'Fiction' }]),
        buildField('655', ' ', '7', [{ code: 'a', value: 'Science fiction.' }])
    ],
    [
        buildField('001', '', '', '789012'),
        buildField('100', '1', ' ', [{ code: 'a', value: 'Austen, Jane' }]),
        buildField('245', '1', '0', [{ code: 'a', value: 'Pride and Prejudice' }]),
        buildField('520', ' ', ' ', [{ code: 'a', value: 'Since its immediate success in 1813, Pride and Prejudice has remained one of the most popular novels.' }]),
        buildField('650', ' ', '0', [{ code: 'a', value: 'Social classes' }, { code: 'x', value: 'Fiction' }])
    ]
];

const fileData = Buffer.concat(records.map(buildRecord));

fs.writeFileSync(path.join(__dirname, '../data/test.mrc'), fileData);
console.log("Created data/test.mrc");
