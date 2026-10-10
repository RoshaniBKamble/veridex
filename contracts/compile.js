// Compiles the registry with solc-js (portable WASM build) and writes ABI + bytecode to artifacts/.
const fs = require("fs");
const path = require("path");
const solc = require("solc");

const file = "VeridexAttestationRegistry.sol";
const input = {
  language: "Solidity",
  sources: { [file]: { content: fs.readFileSync(path.join(__dirname, file), "utf8") } },
  settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
};
const out = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (out.errors || []).filter((e) => e.severity === "error");
if (errors.length) {
  errors.forEach((e) => console.error(e.formattedMessage));
  process.exit(1);
}
const c = out.contracts[file].VeridexAttestationRegistry;
fs.mkdirSync(path.join(__dirname, "artifacts"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "artifacts", "VeridexAttestationRegistry.json"),
  JSON.stringify({ compiler: solc.version(), abi: c.abi, bin: c.evm.bytecode.object }, null, 2));
console.log(`compiled with solc ${solc.version()} → artifacts/VeridexAttestationRegistry.json`);
