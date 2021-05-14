const TelegramBot = require("node-telegram-bot-api");
const Crawler = require("./crawler");
const cities = require("./data/cities.json");

// replace the value below with the Telegram token you receive from @BotFather
const token = "1785949874:AAFrWn_NL9oxxv0Pi3kQ7lyt_q9LfZYInSY";

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, { polling: true });

const runningCrawler = {};

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

bot.onText(/\/start (.+)/, async (msg, match) => {
  const { id } = msg.chat;

  const cityInput = match[1];

  // Check city
  const { city, county, zip } = findCity(cityInput);
  if (!city) {
    return bot.sendMessage(id, `Unbekannte Stadt "${cityInput}" in ${county}.`);
  }

  // Check running instances
  if (runningCrawler[`${id}_${city}`]) {
    return bot.sendMessage(
      id,
      `Impfterminsuche in "${city}", ${county} läuft bereits.`
    );
  }

  // Start search
  runningCrawler[`${id}_${city}`] = new Crawler();
  const crawler = runningCrawler[`${id}_${city}`];

  crawler.start({ city, county }, ({ started, error, success }) => {
    if (started) {
      bot.sendMessage(id, `Impfterminsuche in ${city}, ${county} gestartet.`);
    }
    if (error) {
      bot.sendMessage(id, `CLI Error: ${error}`);
    }
    if (success) {
      bot.sendMessage(id, `🔥 ${success.message} \n👉 ${success.url}`);
    }
  });
});

bot.onText(/\/start$/, (msg) => {
  const { id } = msg.chat;
  bot.sendMessage(
    id,
    "Bitte gib eine Stadt oder PLZ an, um die Impfterminsuche zu beginnen. \nBeispiele: \n👉 /start Stuttgart \n👉 /start 70174"
  );
  bot.sendMessage(
    id,
    "Zum Stoppen der Impfterminsuche kannst du den /stop Befehl verwenden. \nBeispiele: \n👉 /stop Stuttgart \n👉 /stop 70174"
  );
});

bot.onText(/\/stop$/, (msg) => {
  const { id } = msg.chat;
  bot.sendMessage(
    id,
    "Bitte gib eine Stadt an, um die Impfterminsuche zu stoppen. \nBeispiel: /stop Stuttgart"
  );
});

bot.onText(/\/stop (.+)/, (msg, match) => {
  const { id } = msg.chat;
  const cityInput = match[1];

  const { city } = findCity(cityInput);

  if (city) {
    const crawler = runningCrawler[`${id}_${city}`];
    if (crawler) {
      crawler.stop();
      bot.sendMessage(id, `Impfterminsuche in ${city} gestoppt.`);
    } else {
      bot.sendMessage(
        id,
        `Stoppen fehlgeschlagen. Keinen aktiven Crawler zur Impfterminsuche in ${city} gefunden.`
      );
    }
  } else {
    bot.sendMessage(
      id,
      `Stoppen fehlgeschlagen. Keinen aktiven Crawler zur Impfterminsuche in ${cityInput} gefunden.`
    );
  }
});
