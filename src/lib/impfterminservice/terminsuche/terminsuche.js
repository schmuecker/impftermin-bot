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

    // if (this.page) {
    //   await this.page.close();
    //   this.page = undefined;
    // }

    await this.startTerminsuche(this.input, this.callback);
  }

  async startTerminsuche(input, callback = console.log) {
    if (!this.isAlive) {
      return;
    }

    try {
      this.input = input;
      this.callback = callback;

      const { code, zip } = input;

      if (!this.browser) {
        this.browser = await puppeteer.launch({ headless: CONFIG.headless });
      }

      if (!this.page) {
        callback({ started: `Terminsuche mit Code ${code} gestartet` });
        this.page = await this.browser.newPage();
      }

      if (!code) {
        return callback({
          error: "Bitte gib einen Code an um die Terminsuche zu starten.",
        });
      }

      if (!zip) {
        return callback({
          error: "Bitte gib eine PLZ an um die Terminsuche zu starten.",
        });
      }

      const url = `https://001-iz.impfterminservice.de/impftermine/suche/${code}/${zip}`;
      await this.page.goto(url);

      await this.page.waitForTimeout(250);

      // accept cookies
      const [acceptCookies] = await this.page.$x(
        "//a[contains(., ' Alle auswählen ')]"
      );
      if (acceptCookies) {
        await acceptCookies.click();
      }
      await this.page.waitForTimeout(250);

      // Termine suchen
      const [termineSuchenButton] = await this.page.$x(
        "//button[contains(., 'Termine suchen')]"
      );
      if (termineSuchenButton) {
        await termineSuchenButton.click();
      } else {
        // this.restart();
        return callback({ error: "Keinen 'Termine suchen' Button gefunden" });
      }
      await this.page.waitForTimeout(250);

      const checkForFailure = async () => {
        const onFail = () => {
          console.log(
            zip,
            "Keine freien Termine - Restarting search in ",
            city
          );
          this.page.waitForTimeout(1000);
          // return this.restart();
          console.log("Now I would restart.");
        };

        try {
          const xPath =
            "//span[contains(., 'Derzeit stehen leider keine Termine zur Verfügung')]";
          await this.page.waitForXPath(xPath, { timeout: 30000 });

          const [keineTermine] = await this.page.$x(xPath);
          if (keineTermine) {
            onFail();
          }
        } catch (error) {
          onFail();
        }
      };

      checkForFailure();
    } catch (error) {
      callback({ error });
    }
  }
}

module.exports = Crawler;
