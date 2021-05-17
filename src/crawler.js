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
    this.isAlive = true;
  }

  async destroy() {
    this.isAlive = false;
    if (this.page) {
      await this.page.close();
      this.page = undefined;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = undefined;
    }
  }

  async restart() {
    if (!this.input || !this.callback) {
      return console.log(
        "Crawler",
        "Restart failed. No input or no callback available."
      );
    }

    if (this.page) {
      await this.page.close();
      this.page = undefined;
    }

    await this.start(this.input, this.callback);
  }

  async start(input, callback = console.log) {
    if (!this.isAlive) {
      return;
    }

    try {
      this.input = input;
      this.callback = callback;

      const { city, county, zip } = input;

      if (!this.browser) {
        this.browser = await puppeteer.launch({ headless: CONFIG.headless });
      }

      if (!this.page) {
        callback({ started: `Impfterminsuche in ${city} gestartet` });
        this.page = await this.browser.newPage();
      }

      await this.page.goto("https://www.impfterminservice.de/impftermine");
      await this.page.waitForTimeout(250);

      // accept cookies
      const [acceptCookies] = await this.page.$x(
        "//a[contains(., ' Alle auswählen ')]"
      );
      if (acceptCookies) {
        await acceptCookies.click();
      }
      await this.page.waitForTimeout(250);

      // Bundesland auswählen
      const [bundesland] = await this.page.$x(
        "//span[contains(., 'Bitte auswählen')]"
      );
      if (bundesland) {
        await bundesland.click();
      } else {
        return callback({ error: "Kein Bundesland Dropdown gefunden" });
      }
      await this.page.waitForTimeout(250);

      // --> Select county
      const [countyItem] = await this.page.$x(`//li[contains(., '${county}')]`);
      if (countyItem) {
        await countyItem.click();
      } else {
        return callback({ error: "Kein county item gefunden" });
      }
      await this.page.waitForTimeout(250);

      // Impfzentrum auswählen
      const [, impfzentrum] = await this.page.$x(
        "//span[contains(., 'Bitte auswählen')]"
      );
      if (impfzentrum) {
        await impfzentrum.click();
      } else {
        return callback({ error: "Kein impfzentrum dropdown gefunden" });
      }
      await this.page.waitForTimeout(250);

      // --> PLZ
      const [zipItem] = await this.page.$x(
        `//li[contains(., '${zip ?? city}')]`
      );
      if (zipItem) {
        await zipItem.click();
      } else {
        return callback({ error: "Kein zip dropdown gefunden" });
      }

      await this.page.waitForTimeout(250);

      // Zum Impfzentrum
      const [zumImpfzentrum] = await this.page.$x(
        "//button[contains(., 'Zum Impfzentrum')]"
      );
      if (zumImpfzentrum) {
        await zumImpfzentrum.click();
      } else {
        return callback({ error: "Kein button to continue gefunden" });
      }

      await this.page.waitForTimeout(1000);

      // Warteraum...
      try {
        const [warteraum] = await this.page.$x(
          "//h1[contains(., 'Warteraum')]"
        );
        if (warteraum) {
          console.log(zip, "Warteraum - Restarting in ", city);
          return this.restart();
        }
      } catch (error) {}

      // Warte auf Anspruchprüfung
      try {
        await this.page.waitForXPath(
          "//h1[contains(., 'Wurde Ihr Anspruch auf eine Corona-Schutzimpfung bereits geprüft?')]",
          { timeout: 1200000 }
        );
      } catch (error) {
        console.log(zip, "Anspruchfrage nicht gefunden - Restarting in ", city);
        return this.restart();
      }

      const checkForSuccess = async () => {
        try {
          await this.page.waitForXPath(
            "//strong[contains(., 'Gehören Sie einer impfberechtigten Personengruppen an')]",
            {
              timeout: 30000,
            }
          );
          const [alter] = await this.page.$x(
            "//strong[contains(., 'Gehören Sie einer impfberechtigten Personengruppen an')]"
          );
          if (alter) {
            callback({
              success: {
                message: `Es sind freie Termine in ${
                  zip ?? city
                } verfügbar! Jetzt heißt es schnell sein.`,
                url: this.page.url(),
              },
            });
            // Should click on yes, enter age and continue
            // const [ja] = await this.page.$x("//span[contains(., 'Ja')][2]");
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
      const [anspruchH1] = await this.page.$x(
        "//h1[contains(., 'Wurde Ihr Anspruch auf eine Corona-Schutzimpfung bereits geprüft?')]"
      );
      await this.page.waitForTimeout(250);
      if (anspruchH1) {
        // accept cookies
        const [acceptCookies] = await this.page.$x(
          "//a[contains(., ' Alle auswählen ')]"
        );
        if (acceptCookies) {
          await acceptCookies.click();
        }
        await this.page.waitForTimeout(250);

        // Klick auf "Nein"
        const [neinButton] = await this.page.$x("//span[contains(., 'Nein')]");
        if (neinButton) {
          await neinButton.click();
        } else {
          return callback({ error: "Kein Nein Button gefunden" });
        }
      } else {
        return callback({ error: "Kein Anspruch Heading gefunden" });
      }

      await this.page.waitForTimeout(250);

      checkForSuccess();

      try {
        await this.page.waitForXPath(
          "//div[contains(., 'Es wurden keine freien Termine')]",
          { timeout: 30000 }
        );

        const [keineTermine] = await this.page.$x(
          "//div[contains(., 'Es wurden keine freien Termine')]"
        );
        if (keineTermine) {
          console.log(
            zip,
            "Keine freien Termine - Restarting search in ",
            city
          );
          this.page.waitForTimeout(500);
          return this.restart();
        }
      } catch (error) {}
    } catch (error) {
      callback({ error });
    }
  }
}

module.exports = Crawler;
