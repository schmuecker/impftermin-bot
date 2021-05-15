const path = require("path");
const { klona } = require("klona/full");
const { dset } = require("dset/merge");
var flatCache = require("flat-cache");
const TelegramBot = require("node-telegram-bot-api");
const Crawler = require("../crawler");
const cities = require("../data/cities.json");

const token = "1785949874:AAFrWn_NL9oxxv0Pi3kQ7lyt_q9LfZYInSY";
const bot = new TelegramBot(token, { polling: true });

var cache = flatCache.load("crawlers", path.join(__dirname, "../../cache"));
const runningCrawler = klona(cache.all());

/* UTILITIES */

function findCity(string) {
  let city;
  let matchedCounty;
  let zip;
  Object.entries(cities).forEach(([county, citiesArray]) => {
    // Check zip codes first
    citiesArray.forEach((object) => {
      if (object.zip === string) {
        city = `${object.zip} ${object.city}`;
        matchedCounty = county;
        zip = object.zip;
      }
    });
    // Fuzzy search for cities
    citiesArray.forEach((object) => {
      if (object.city.includes(string)) {
        city = `${object.zip} ${object.city}`;
        matchedCounty = county;
        zip = object.zip;
      }
    });
  });
  return { city, county: matchedCounty, zip };
}

const startCrawler = ({ crawlerId, chatId, city, county, zip }) => {
  cache.setKey(crawlerId, {
    city,
    county,
    zip,
  });
  cache.save(true);

  dset(runningCrawler, crawlerId, {
    instance: new Crawler(),
    startTime: Date.now(),
  });

  const crawler = runningCrawler[crawlerId].instance;

  try {
    crawler.start({ city, county }, ({ error, success }) => {
      if (error) {
        console.log(`CLI Error for ${zip}: ${error}`);
      }
      if (success) {
        bot.sendMessage(chatId, `🔥 ${success.message} \n👉 ${success.url}`);
      }
    });
  } catch (error) {
    crawler.restart();
  }
};

/* BOOT UP */

// Start crawlers from cache
Object.entries(runningCrawler).forEach(([crawlerId, { city, county, zip }]) => {
  const chatId = crawlerId.split("_")[0];
  startCrawler({ crawlerId, chatId, city, county, zip });
});

// Restart crawlers every 15 minutes (check every minute)
setInterval(() => {
  Object.values(runningCrawler).forEach((crawler) => {
    const now = Date.now();
    const differenceInMinutes = Math.floor(
      (now - crawler.startTime) / (1000 * 60)
    );
    if (differenceInMinutes > 10 && crawler.instance) {
      crawler.instance.restart();
      console.log("restart", crawler.instance);
      crawler.startTime = Date.now();
    }
  });
}, 1000 * 10);

/* TELEGRAM MESSAGES */

/* Search command */
bot.onText(/\/search (.+)/, async (msg, match) => {
  const { id } = msg.chat;

  const chosenCities = match[1].split(" ");

  chosenCities.forEach((cityInput) => {
    // Check city
    const { city, county, zip } = findCity(cityInput);
    if (!city) {
      return bot.sendMessage(id, `Unbekannte Stadt/PLZ "${cityInput}".`);
    }

    const crawlerId = `${id}_${zip}`;
    // Check running instances
    if (runningCrawler[crawlerId]) {
      return bot.sendMessage(
        id,
        `Impfterminsuche in "${city}", ${county} läuft bereits.`
      );
    }

    bot.sendMessage(id, `🔎 Impfterminsuche in ${city}, ${county} gestartet.`);

    startCrawler({
      crawlerId,
      chatId: id,
      city,
      county,
      zip,
    });
  });
});

/* Incomplete search command */
bot.onText(/\/search$/, (msg) => {
  const { id } = msg.chat;
  bot.sendMessage(
    id,
    "ℹ️ Bitte gib eine Stadt oder PLZ an, um die Impfterminsuche zu beginnen. \nBeispiele: \n👉 /search Stuttgart \n👉 /search 70174"
  );
});

/* Start command */
bot.onText(/\/start$/, (msg) => {
  const { id } = msg.chat;
  bot.sendMessage(
    id,
    "Mit dem /search Befehl kannst du die Suche nach einem Impftermin starten. \nBeispiele: \n👉 /search Stuttgart \n👉 /search 70174"
  );
  bot.sendMessage(
    id,
    "Du kannst auch mehrere Suchen mit einem Befehl starten. \nBeispiele: \n👉 /search 70174 Singen Villingen"
  );
  bot.sendMessage(
    id,
    "Zum Stoppen der Impfterminsuche kannst du den /stop Befehl verwenden. \nBeispiele: \n👉 /stop Stuttgart \n👉 /stop 70174"
  );
});

/* Stop command */
bot.onText(/\/stop (.+)/, (msg, match) => {
  const { id } = msg.chat;
  const cityInput = match[1];

  const { city, zip } = findCity(cityInput);

  if (city) {
    const crawler = runningCrawler[`${id}_${zip}`].instance;
    if (crawler) {
      try {
        crawler.stop();
        delete runningCrawler[`${id}_${zip}`];
        cache.removeKey(`${id}_${zip}`);
        cache.save(true);
        bot.sendMessage(id, `🛑 Impfterminsuche in ${city} gestoppt.`);
      } catch (error) {}
    } else {
      bot.sendMessage(
        id,
        `ℹ️ Keinen aktiven Crawler zur Impfterminsuche in ${city} gefunden.`
      );
    }
  } else {
    bot.sendMessage(
      id,
      `ℹ️ Keinen aktiven Crawler zur Impfterminsuche in ${cityInput} gefunden.`
    );
  }
});

/* Incomplete stop command */
bot.onText(/\/stop$/, (msg) => {
  const { id } = msg.chat;
  bot.sendMessage(
    id,
    "ℹ️ Bitte gib eine Stadt an, um die Impfterminsuche zu stoppen. \nBeispiel: /stop Stuttgart"
  );
});

/* Cities command */
bot.onText(/\/cities$/, (msg) => {
  const { id } = msg.chat;
  bot.sendMessage(id, `Verfügbare Städte: \n`);

  Object.entries(cities).forEach(([county, citiesOfCounty]) => {
    let output = "";
    output = output + `\n🇩🇪 ${county}`;
    citiesOfCounty.forEach(({ zip, city }) => {
      output = output + `\n - ${zip}   ${city.substring(0, 50)}...`;
    });
    bot.sendMessage(id, output);
  });
});

/* running command */
bot.onText(/\/running$/, (msg) => {
  const { id } = msg.chat;

  let output = "";
  console.log(runningCrawler);
  Object.values(runningCrawler).forEach(({ city, zip }) => {
    output = output + `\n - ${city.substring(0, 50)}...`;
  });
  console.log(output);
  bot.sendMessage(id, `👀 Laufende Suchen: \n ${output}`);
});
