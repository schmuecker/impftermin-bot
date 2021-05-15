const puppeteer = require("puppeteer");

const CONFIG = {
  headless: false,
};

class Crawler {
  constructor() {
    this.browser = undefined;
    this.page = undefined;
    this.input = undefined;
    this.callback = undefined;
  }

  async stop() {
    if (this.page) {
      await this.page.close();
      this.page = undefined;
    }
  }

  async restart() {
    if (!this.input || !this.callback) {
      return console.log(
        "Crawler",
        "Restart failed. No input or no callback available."
      );
    }
    await this.stop();
    await this.start(this.input, this.callback);
  }

  async start(input, callback = console.log) {
    try {
      this.input = input;
      this.callback = callback;

      const { city, county, zip } = input;

      if (!this.page) {
        // Start function is running the first time
        callback({ started: `Impfterminsuche in ${city} gestartet` });
      }

      if (!this.browser) {
        this.browser = await puppeteer.launch({ headless: CONFIG.headless });
      }

      this.page = this.page ?? (await this.browser.newPage());

      const page = this.page;

      await page.goto("https://www.impfterminservice.de/impftermine");
      await page.waitForTimeout(250);

      // accept cookies
      const [acceptCookies] = await page.$x(
        "//a[contains(., ' Alle auswählen ')]"
      );
      if (acceptCookies) {
        await acceptCookies.click();
      }
      await page.waitForTimeout(250);

      // Bundesland auswählen
      const [bundesland] = await page.$x(
        "//span[contains(., 'Bitte auswählen')]"
      );
      if (bundesland) {
        await bundesland.click();
      } else {
        return callback({ error: "Kein Bundesland Dropdown gefunden" });
      }
      await page.waitForTimeout(250);

      // --> Select county
      const [countyItem] = await page.$x(`//li[contains(., '${county}')]`);
      if (countyItem) {
        await countyItem.click();
      } else {
        return callback({ error: "Kein county item gefunden" });
      }
      await page.waitForTimeout(250);

      // Impfzentrum auswählen
      const [, impfzentrum] = await page.$x(
        "//span[contains(., 'Bitte auswählen')]"
      );
      if (impfzentrum) {
        await impfzentrum.click();
      } else {
        return callback({ error: "Kein impfzentrum dropdown gefunden" });
      }
      await page.waitForTimeout(250);

      // --> PLZ
      const [zipItem] = await page.$x(`//li[contains(., '${zip ?? city}')]`);
      if (zipItem) {
        await zipItem.click();
      } else {
        return callback({ error: "Kein zip dropdown gefunden" });
      }

      await page.waitForTimeout(250);

      // Zum Impfzentrum
      const [zumImpfzentrum] = await page.$x(
        "//button[contains(., 'Zum Impfzentrum')]"
      );
      if (zumImpfzentrum) {
        await zumImpfzentrum.click();
      } else {
        return callback({ error: "Kein button to continue gefunden" });
      }

      await page.waitForTimeout(1000);

      // Warteraum...
      try {
        const [warteraum] = await page.$x("//h1[contains(., 'Warteraum')]");
        if (warteraum) {
          console.log(zip, "Warteraum - Restarting in ", city);
          return this.restart();
        }
      } catch (error) {}

      // Warte auf Anspruchprüfung
      try {
        await page.waitForXPath(
          "//h1[contains(., 'Wurde Ihr Anspruch auf eine Corona-Schutzimpfung bereits geprüft?')]",
          { timeout: 1200000 }
        );
      } catch (error) {
        console.log(zip, "Anspruchfrage nicht gefunden - Restarting in ", city);
        return this.restart();
      }

      const checkForSuccess = async () => {
        try {
          await page.waitForXPath(
            "//strong[contains(., 'Gehören Sie einer impfberechtigten Personengruppen an')]",
            {
              timeout: 30000,
            }
          );
          const [alter] = await page.$x(
            "//strong[contains(., 'Gehören Sie einer impfberechtigten Personengruppen an')]"
          );
          if (alter) {
            callback({
              success: {
                message: `Es sind freie Termine in ${
                  zip ?? city
                } verfügbar! Jetzt heißt es schnell sein.`,
                url: page.url(),
              },
            });
            // Should click on yes, enter age and continue
            // const [ja] = await page.$x("//span[contains(., 'Ja')][2]");
            // if (ja) {
            //   await ja.click();
            // } else {
            //   return callback({ error: "Kein Ja Button gefunden" });
            // }
          }
        } catch (error) {}
      };

      // Klicke auf Nein und checke Ergebnis
      // Anspruchprüfung
      const [anspruchH1] = await page.$x(
        "//h1[contains(., 'Wurde Ihr Anspruch auf eine Corona-Schutzimpfung bereits geprüft?')]"
      );
      await page.waitForTimeout(250);
      if (anspruchH1) {
        // accept cookies
        const [acceptCookies] = await page.$x(
          "//a[contains(., ' Alle auswählen ')]"
        );
        if (acceptCookies) {
          await acceptCookies.click();
        }
        await page.waitForTimeout(250);

        // Klick auf "Nein"
        const [neinButton] = await page.$x("//span[contains(., 'Nein')]");
        if (neinButton) {
          await neinButton.click();
        } else {
          return callback({ error: "Kein Nein Button gefunden" });
        }
      } else {
        return callback({ error: "Kein Anspruch Heading gefunden" });
      }

      await page.waitForTimeout(250);

      checkForSuccess();

      try {
        await page.waitForXPath(
          "//div[contains(., 'Es wurden keine freien Termine')]",
          { timeout: 30000 }
        );

        const [keineTermine] = await page.$x(
          "//div[contains(., 'Es wurden keine freien Termine')]"
        );
        if (keineTermine) {
          console.log(
            zip,
            "Keine freien Termine - Restarting search in ",
            city
          );
          page.waitForTimeout(500);
          return this.restart();
        }
      } catch (error) {}
    } catch (error) {
      callback({ error });
    }
  }
}

module.exports = Crawler;
