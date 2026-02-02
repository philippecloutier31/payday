import fetch from 'node-fetch';

const TOKEN = '2e493c92f42d4d6fa63f9f176d53db13';
const URL = 'https://api.blockcypher.com/v1/eth/main/addrs';
const addresses = [
    '0x2b8775C97333FCddE84B4a925Be127AB49981BDF',
    '0x03e77852c2b00C9B82AD6F7FF8aD260EFE1C3102',
    '0x2A99B41A4105ACccc0fB6E54Ac269cB27E6E75f2',
    '0xcCBAE07EF4EEa95ffF14275F467FF731D27ff08E'
];

async function check() {
    for (const addr of addresses) {
        console.log(`Checking ${addr}...`);
        try {
            const res = await fetch(`${URL}/${addr}?token=${TOKEN}`);
            const data = await res.json();
            console.log(JSON.stringify(data, null, 2));
        } catch (e) {
            console.error(`Error: ${e.message}`);
        }
    }
}

check();
