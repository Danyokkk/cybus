const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

const file = 'backend/data/gtfs/routes.txt';
fs.createReadStream(file)
    .pipe(csv())
    .on('headers', (headers) => {
        console.log('Headers:', headers.map(h => `'${h}'`));
    })
    .on('data', (data) => {
        console.log('First row keys:', Object.keys(data).map(k => `'${k}'`));
        process.exit(0);
    });
