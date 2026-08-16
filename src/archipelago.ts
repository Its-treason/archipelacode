/** @format */
import * as vscode from "vscode";
import packageJson from "../package.json";
import problemsJson from "./data/problems.json";
import { APConnectionInfo, globalState } from "./globalState";
import { archipelacodeChannel } from "./outputChannel";
import {
  APStatus,
  Category,
  LangEnable,
  Problem,
  State,
  SubProblem,
  supportedLangSlugs,
  VersionIdentifier,
} from "./shared";
import { archipelaCodeTreeDataProvider } from "./treeView/treeDataProvider";
import {
  countOccurrences,
  getLanguageOverride,
  versionStringToVersion,
} from "./utils";

class ArchipelagoController {
  hostname: string = "archipelago.gg";
  port!: number;
  slotname!: string;
  password: string = "";
  status: APStatus = APStatus.DISCONNECTED;
  protocol: string = "ws";
  client: any;
  uuid: string = "";
  slotData!: import("archipelago.js", {
    with: { "resolution-mode": "import" }
  }).JSONRecord;
  extensionVersion!: VersionIdentifier;

  constructor() {}

  getUrl(): string {
    return `${this.protocol}://${this.hostname}:${this.port}`;
  }

  async initializeClient(
    hostname = "archipelago.gg",
    port: number,
    slotname: string,
    password = "",
  ) {
    this.hostname = hostname;
    this.port = port;
    this.slotname = slotname;
    this.password = password;
    this.status = APStatus.CONNECTING;

    this.extensionVersion = await this.getExtensionVersion();

    this.protocol = "ws";

    const { Client } = await import("archipelago.js");
    type Item = import("archipelago.js", {
      with: { "resolution-mode": "import" }
    }).Item;
    type MessageNode = import("archipelago.js", {
      with: { "resolution-mode": "import" }
    }).MessageNode;
    this.client = new Client();

    const uuid = await import("uuid");
    this.uuid = uuid.v4();

    // archipelacodeChannel.appendLine(`Your UUID: ${this.uuid}`);

    this.client.messages.on("message", (text: string) => {
      archipelacodeChannel.appendLine(text);
    });

    this.client.items.on(
      "itemsReceived",
      async (items: Item[], startingIndex: number) => {
        await this.receiveItem(items, startingIndex);
        await archipelaCodeTreeDataProvider.refresh();
      },
    );

    // client.check() only sends the packet; room.checkedLocations is not
    // updated until the server echoes it back. Refreshing the tree from here
    // rather than straight after check() is what moves a problem out of
    // "Available" once the check actually lands.
    this.client.room.on("locationsChecked", async (locations: number[]) => {
      archipelacodeChannel.appendLine(
        `Locations checked: ${locations.join(", ")}`,
      );
      if (this.client.room.checkedLocations.length >= this.getEndGoal()) {
        this.client.goal();
      }
      await archipelaCodeTreeDataProvider.refresh();
    });
    try {
      if (!this.password) {
        await this.client.login(this.getUrl(), this.slotname, "ArchipelaCode");
      } else {
        await this.client.login(this.getUrl(), this.slotname, "ArchipelaCode", {
          items: 7,
          password: this.password,
          slotData: true,
          tags: [],
          uuid: this.uuid,
          version: {
            major: 0,
            minor: 6,
            build: 3,
          },
        });
      }
    } catch {
      this.protocol = "wss";
      if (!this.password) {
        await this.client.login(this.getUrl(), this.slotname, "ArchipelaCode");
      } else {
        await this.client.login(this.getUrl(), this.slotname, "ArchipelaCode", {
          items: 7,
          password: this.password,
          slotData: true,
          tags: [],
          uuid: this.uuid,
          version: {
            major: 0,
            minor: 6,
            build: 3,
          },
        });
      }
    }
    this.slotData = await this.client.players.self.fetchSlotData();
    this.status = APStatus.CONNECTED;
    if (!(await this.checkVersion())) {
      vscode.window.showErrorMessage(
        "Extension is outdated! Please update the extension before continuing.",
      );
      archipelacodeChannel.appendLine(
        "Extension is outdated! Please update the extension before continuing.",
      );
    }

    let connectionInfo: APConnectionInfo = {
      hostname: this.hostname,
      port: this.port,
      slotname: this.slotname,
      password: this.password,
    };

    globalState.setAPConnectionInfo(connectionInfo);
  }

  async getExtensionVersion(): Promise<VersionIdentifier> {
    return versionStringToVersion(packageJson.version);
  }

  async checkVersion(): Promise<boolean> {
    let extensionVersion: VersionIdentifier = await this.getExtensionVersion();
    let apworldVersion: VersionIdentifier = {
      major: 999,
      minor: 999,
      build: 999,
    };
    let metadata = this.slotData.metadata;
    if (metadata && typeof metadata === "object") {
      for (const [key, value] of Object.entries(metadata)) {
        if (key === "minimum_extension_version") {
          apworldVersion = versionStringToVersion(String(value));
        }
      }
    }
    let result: boolean = false;
    if (extensionVersion.major > apworldVersion.major) {
      result = true;
    } else if (
      extensionVersion.major === apworldVersion.major &&
      extensionVersion.minor > apworldVersion.minor
    ) {
      result = true;
    } else if (
      extensionVersion.major === apworldVersion.major &&
      extensionVersion.minor === apworldVersion.minor &&
      extensionVersion.build >= apworldVersion.build
    ) {
      result = true;
    } else {
      result = false;
    }
    return result;
  }

  async disconnectIfConnected(): Promise<void> {
    if (this.status === APStatus.CONNECTED) {
      this.status = APStatus.DISCONNECTING;
      this.client.socket.disconnect();
      this.status = APStatus.DISCONNECTED;
    }
  }

  async hasLocationBeenClaimedPreviously(titleSlug: string): Promise<boolean> {
    let locationID = this.titleSlugToLocationId(titleSlug);
    return this.client.room.checkedLocations.includes(locationID);
  }

  async sendCheck(titleSlug: string) {
    let locationID = this.titleSlugToLocationId(titleSlug);
    archipelacodeChannel.appendLine(
      `Sending check for location '${locationID}'`,
    );
    // The goal check and the tree refresh both happen in the "locationsChecked"
    // handler, once the server has confirmed the check and room.checkedLocations
    // actually reflects it.
    await this.client.check(locationID);
  }

  titleSlugToLocationId(titleSlug: string): number {
    let locationID = -1;
    Object.entries(problemsJson.problems).forEach((entry) => {
      if (entry[0] === titleSlug) {
        locationID = entry[1].locationId;
      }
    });
    return locationID;
  }

  async receiveItem(
    items: import("archipelago.js", {
      with: { "resolution-mode": "import" }
    }).Item[],
    startingIndex: number,
  ) {
    if (!(this.status === APStatus.CONNECTING)) {
      items.forEach(async (item) => {
        vscode.window.showInformationMessage(
          `Received ${item.name} from ${item.sender.name}`,
        );
      });
    }
  }

  async isLocationLocked(entry: SubProblem): Promise<boolean> {
    if (await this.hasLocationBeenClaimedPreviously(entry.titleSlug)) {
      return false;
    } else {
      let regionId = await this.getRegionFromLocationId(entry.locationId);
      return !(
        countOccurrences(
          this.client.items.received.map((item: any) => item.id),
          6700902002,
        ) >= regionId
      );
    }
  }

  async isLocationIncluded(locationId: number): Promise<boolean> {
    if (this.client.room.allLocations.includes(locationId)) {
      return true;
    } else {
      return false;
    }
  }

  async getRegionFromLocationId(locationId: number): Promise<number> {
    let regions = this.slotData.regions;
    if (regions && typeof regions === "object") {
      for (const [key, locations] of Object.entries(regions)) {
        let regionId = Number(key);
        if (locations && typeof locations === "object") {
          for (const [locId, location] of Object.entries(locations)) {
            if (Number(locId) === locationId) {
              return regionId;
            }
          }
        }
      }
    }
    return 0;
  }

  itemIdToName(itemId: number): string {
    let items = this.slotData.items;
    if (items && typeof items === "object") {
      for (const [key, value] of Object.entries(items)) {
        if (key === String(itemId)) {
          return String(value);
        }
      }
    }
    return "Unknown Item";
  }

  getEndGoal(): number {
    let metadata = this.slotData.metadata;
    if (metadata && typeof metadata === "object") {
      for (const [key, value] of Object.entries(metadata)) {
        if (key === "EndGoal") {
          return Number(value);
        }
      }
    }
    return -1;
  }

  getEnabledLanguages(): LangEnable[] {
    let result: LangEnable[] = [];
    if (!this.slotData) {
      return result;
    }
    let metadata = this.slotData.metadata;
    if (metadata && typeof metadata === "object") {
      for (const [key, value] of Object.entries(metadata)) {
        if (key === "included_languages") {
          if (value && typeof value === "object") {
            for (const [lang, enabled] of Object.entries(value)) {
              result.push({
                langSlug: lang,
                enabled: Boolean(enabled),
              });
            }
          }
        }
      }
    }
    return result;
  }

  // Whether the slot data actually told us which language the slot uses.
  // APWorld v0.0.2 and older only ever write "python3" and "javascript" into
  // `metadata.included_languages`, so a slot generated for Typescript or Golang
  // reports every language it knows about as disabled.
  hasReportedLanguages(): boolean {
    return this.getEnabledLanguages().some((entry) => entry.enabled);
  }

  isUsingLanguageFallback(): boolean {
    return getLanguageOverride() === "auto" && !this.hasReportedLanguages();
  }

  // The language slugs the player may solve problems in. Falls back to the
  // languages the slot data never mentioned when it reports none as enabled,
  // since those are exactly the ones an older APWorld is unable to report.
  getIncludedLangSlugs(): string[] {
    const override = getLanguageOverride();
    if (override !== "auto") {
      return [override];
    }

    const reported = this.getEnabledLanguages();
    const enabled = reported
      .filter((entry) => entry.enabled)
      .map((entry) => entry.langSlug);
    if (enabled.length > 0) {
      return enabled;
    }

    const unreported = supportedLangSlugs.filter(
      (langSlug) => !reported.some((entry) => entry.langSlug === langSlug),
    );
    const fallback =
      unreported.length > 0 ? unreported : [...supportedLangSlugs];
    archipelacodeChannel.appendLine(
      `Your slot data doesn't report an enabled language. This happens with APWorld v0.0.2 and older when the slot was generated for Typescript or Golang.`,
    );
    archipelacodeChannel.appendLine(
      `Falling back to: ${fallback.join(", ")}. Set "archipelacode.languageOverride" if that's wrong.`,
    );
    return fallback;
  }

  async getAllLocations(): Promise<Problem[]> {
    let problems: Problem[] = [];
    for (const [name, entry] of Object.entries(problemsJson.problems)) {
      if (await this.isLocationIncluded(entry.locationId)) {
        problems.push({
          id: entry.id,
          difficulty: entry.difficulty,
          title: entry.title,
          titleSlug: entry.titleSlug,
          problemUrl: entry.problemUrl,
          locationId: entry.locationId,
          category:
            (await this.isLocationLocked(entry)) ? Category.Locked
            : (await this.hasLocationBeenClaimedPreviously(entry.titleSlug)) ?
              Category.Solved
            : Category.Available,
          state:
            (await this.isLocationLocked(entry)) ? State.Locked
            : (await this.hasLocationBeenClaimedPreviously(entry.titleSlug)) ?
              State.Solved
            : State.Unsolved,
        });
      }
    }
    return problems;
  }

  async sendMessage(message: string): Promise<void> {
    await this.client.messages.say(message);
  }

  getReceivedItemNames(): string[] {
    type Item = import("archipelago.js", {
      with: { "resolution-mode": "import" }
    }).Item;
    let items: Item[] = this.client.items.received;
    let names: string[] = [];
    items.forEach((item) => {
      names.push(item.name);
    });
    return names;
  }
}

export const apController: ArchipelagoController = new ArchipelagoController();
