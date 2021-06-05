const path = require("path");
var flatCache = require("flat-cache");

// eslint-disable-next-line no-undef
const cachePath = path.join(__dirname, "../../cache");

const crawlerCache = flatCache.load("crawlers", cachePath);
console.log("Crawler", Object.keys(crawlerCache.all()));

const notifyCache = flatCache.load("notify", cachePath);
console.log("Notifications", notifyCache.all());
