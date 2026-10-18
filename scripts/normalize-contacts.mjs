import contacts from "../functions/src/contacts.cjs";
let input = "";
for await (const chunk of process.stdin) input += chunk;
const values = JSON.parse(input);
if (!Array.isArray(values)) throw new Error("Expected an array of provider contact strings.");
process.stdout.write(JSON.stringify(values.map(contacts.parse)));
