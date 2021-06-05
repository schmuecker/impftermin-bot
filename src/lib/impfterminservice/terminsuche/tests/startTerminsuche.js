require("dotenv").config({ path: "../../../../../.env" });
const TerminCrawler = require("../terminsuche");

const c = new TerminCrawler();

console.log(process.env.SAMPLE_CODE);
c.startTerminsuche({ code: process.env.SAMPLE_CODE, zip: "70376" });
