const [major, minor] = process.versions.node.split(".").map(Number);
const supported = major > 22 || (major === 22 && minor >= 13);

if (!supported) {
  console.error(`[freshcheckout] Unsupported runtime ${process.version}; Node >=22.13.0 is required.`);
  process.exitCode = 1;
} else {
  console.log(`[freshcheckout] Observed runtime ${process.version}; Node >=22.13.0 satisfied.`);
}
