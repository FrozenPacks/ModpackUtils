import { endGroup, getInput, info, startGroup, warning } from "@actions/core";
import axios from "axios";
import FormData from "form-data";
import { createReadStream, existsSync, readdirSync, readFileSync } from "fs";
import { basename, extname, join } from "path";
import yaml from "yaml";
import { RawRelease, strip } from "./releases";

export interface MinecraftInstance {
  name: string;
  baseModLoader: {
    forgeVersion: string;
    name: string;
    type: number;
    downloadUrl: string;
    filename: string;
    installMethod: number;
    latest: boolean;
    recommended: boolean;
    minecraftVersion: string;
  };
  installedAddons: Array<{
    addonID: number;
    installedFile: {
      categorySectionPackageType: number;
      id: number;
      fileName: string;
    };
  }>;
}

const webDir = "web";

function getApi() {
  const token = getInput("web_token", { required: true });
  return axios.create({
    baseURL: getInput("api"),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
}

export interface WebData {
  name: string;
  author: string;
  description: string;
  slug: string;
  assets?: Record<string, string | undefined>;
  links?: Record<string, string | undefined>;
  private: boolean;
}

export async function getWebData() {
  const api = getApi();
  const { data } = await api.get<WebData>("/pack");
  return data;
}

export async function updateWeb() {
  startGroup("Updating web");

  await Promise.all([...updatePages(), updateData(), updateAssets()]);

  endGroup();
}

async function updateData() {
  const api = getApi();

  const file = join(webDir, "pack.yml");
  if (!existsSync(file)) {
    warning("Skip updating pack data");
    return;
  }

  const packData = yaml.parse(readFileSync(file).toString());

  await api.put("/pack", packData);
  info("Updated pack data");
}

export async function createRelease(release: RawRelease, dir = "") {
  const api = getApi();

  const tag = release.tag_name;

  const cfFile = join(dir, "minecraftinstance.json");
  if (!existsSync(cfFile))
    throw new Error("minecraftinstance.json file missing");

  const cfData = JSON.parse(
    readFileSync(cfFile).toString()
  ) as MinecraftInstance;

  const installedAddons = cfData.installedAddons.filter((addon) =>
    existsSync(join(dir, "mods", addon.installedFile.fileName))
  );

  const { data } = await api.put(`/pack/release/${tag}`, {
    installedAddons,
    ...strip(release),
  });

  info(`Created release for version '${tag}'`);

  return data;
}

async function updateAssets() {
  const api = getApi();

  const assetsDir = join(webDir, "assets");

  if (!existsSync(assetsDir)) {
    warning("No assets defined");
    return;
  }

  const assets = readdirSync(assetsDir).map((f) => join(assetsDir, f));
  const assetsData = assets.reduce((data, img) => {
    data.append(basename(img), createReadStream(img));
    return data;
  }, new FormData());

  await api.put(`/pack/assets`, assetsData, {
    headers: assetsData.getHeaders(),
  });
  info(`Updated assets`);
}

function updatePages() {
  const api = getApi();

  const pageDir = join(webDir, "pages");

  if (!existsSync(pageDir)) {
    warning("No pages defined");
    return [];
  }

  const pages = readdirSync(pageDir).map((f) => join(pageDir, f));

  const parsed = pages.map((page) => {
    const ext = extname(page);
    const content = readFileSync(page).toString();
    switch (ext) {
      case ".json":
        return JSON.parse(content);
      case ".yml":
        return yaml.parse(content);
      default:
        return {};
    }
  });

  return parsed.map(async (content) => {
    await api.put("pack/page", content);
    info(`Uploaded ${content.title}`);
  });
}
