const axios = require('axios');

async function test() {
    try {
        const res = await axios.get('http://20.19.98.194:8328/Api/api/gtfs-realtime', {
            responseType: 'arraybuffer'
        });
        console.log("Status:", res.status);
        console.log("Length:", res.data.length);
        console.log("First bytes:", res.data.slice(0, 10));
    } catch (err) {
        console.log("Error:", err.message);
        if (err.response) console.log("Status:", err.response.status);
    }
}

test();
