import type { SettingsPage } from '../app/settingsPages';

/**
 * Every setting the owner may look for, and the page that holds it. Words in English and in
 * French: the owner types what comes to mind ("voix", "clé", "thème"), not the label on the row.
 */
export interface SettingsEntry {
  page: SettingsPage;
  title: string;
  /** The page, said the way the index says it: where the result leads. */
  where: string;
  terms: string;
  /** Only the Android app has it (an APK to download, a phone to pair). */
  nativeOnly?: boolean;
}

export const SETTINGS_ENTRIES: readonly SettingsEntry[] = [
  { page: 'appearance', where: 'Appearance', title: 'Theme', terms: 'dark light system sombre clair thème mode nuit couleur' },
  { page: 'appearance', where: 'Appearance', title: 'Message size', terms: 'text font size zoom taille police texte lecture' },
  { page: 'appearance', where: 'Appearance', title: 'Always expand tool cards', terms: 'fold unfold tools cards plier déplier outils cartes' },
  { page: 'appearance', where: 'Appearance', title: 'Always expand reasoning', terms: 'thinking fold réflexion raisonnement plier raisonnement' },
  { page: 'notifications', where: 'Notifications', title: 'Allow notifications', terms: 'permission push tray autoriser navigateur' },
  { page: 'notifications', where: 'Notifications', title: 'Sounds', terms: 'sound ring ringtone son sons sonnerie alerte' },
  { page: 'updates', where: 'Updates', title: 'Update the server', terms: 'upgrade version mise à jour serveur release' },
  { page: 'updates', where: 'Updates', title: 'Update the app', terms: 'apk upgrade version mise à jour application', nativeOnly: true },
  { page: 'updates', where: 'Updates', title: 'Download updates on mobile data', terms: 'wifi 4g 5g cellular données mobiles', nativeOnly: true },
  { page: 'models', where: 'Models', title: 'Default model', terms: 'model llm modèle par défaut effort' },
  { page: 'models', where: 'Models', title: 'Fallback model', terms: 'image vision secours repli' },
  { page: 'models', where: 'Models', title: 'Retry on provider failure', terms: 'retry error réessayer erreur panne' },
  { page: 'models', where: 'Models', title: 'ChatGPT plan', terms: 'codex openai plus pro subscription abonnement compte account sign in connexion provider' },
  { page: 'models', where: 'Models', title: 'Claude plan', terms: 'anthropic max pro token subscription abonnement compte account sign in connexion provider api key' },
  { page: 'models', where: 'Models', title: 'Providers and API keys', terms: 'provider api key clé fournisseur openrouter groq mistral deepseek' },
  { page: 'tags', where: 'Models', title: 'Tags', terms: 'tag route cheap medium étiquette routage' },
  { page: 'agents', where: 'Agents', title: 'Agents', terms: 'orchestrator main general research cron browser effort sous-agent subagent' },
  { page: 'newagent', where: 'Agents', title: 'New agent', terms: 'create add agent créer nouvel ajouter' },
  { page: 'services', where: 'Services', title: 'Speech-to-text', terms: 'voice voix vocal transcription stt groq whisper dictée' },
  { page: 'services', where: 'Services', title: 'Text-to-speech', terms: 'tts speak voice voix edge piper parler lecture audio' },
  { page: 'services', where: 'Services', title: 'Location', terms: 'gps geoapify localisation position adresse' },
  { page: 'services', where: 'Services', title: 'Web search', terms: 'searxng search recherche internet' },
  { page: 'services', where: 'Services', title: 'Embeddings', terms: 'memory mémoire sens meaning recall' },
  { page: 'services', where: 'Services', title: 'Browser', terms: 'chromium navigateur pages forms formulaires' },
  { page: 'workspaces', where: 'Workspaces', title: 'Workspaces', terms: 'folder directory dossier répertoire projet' },
  { page: 'workspaces', where: 'Workspaces', title: 'Instructions', terms: 'agents.md soul.md user.md profil profile prompt consignes' },
  { page: 'skills', where: 'Skills', title: 'Skills', terms: 'skill compétences savoir-faire' },
  { page: 'tools', where: 'Tools', title: 'Tools', terms: 'tool outils plugins bash enable désactiver' },
  { page: 'mcps', where: 'Tools', title: 'MCP servers', terms: 'mcp server serveur externe' },
  { page: 'advanced', where: 'Advanced', title: 'This device', terms: 'token id appareil téléphone identifiant credential' },
  { page: 'servers', where: 'Server', title: 'Server address', terms: 'server url connect disconnect reconnect serveur adresse connexion' },
  { page: 'servers', where: 'Server', title: 'Join with an invitation', terms: 'join rejoindre invitation pair pairing appairer code qr scan', nativeOnly: true },
  { page: 'devices', where: 'Devices', title: 'Paired devices', terms: 'phone browser appareils appairés revoke révoquer' },
  { page: 'devices', where: 'Devices', title: 'Add a device', terms: 'invite invitation inviter ajouter appareil pair pairing appairer associer qr code' },
  { page: 'devices', where: 'Devices', title: 'Approve a request', terms: 'approve approuver demande request pairing code chiffres digits' },
  { page: 'nodes', where: 'Nodes', title: 'Nodes', terms: 'node remote distant machine server serveur arm bras ssh revoke révoquer tools outils' },
  { page: 'nodes', where: 'Nodes', title: 'Add a node', terms: 'add node ajouter machine installer install appairer pair remote distant serveur' },
  { page: 'tools', where: 'Tools', title: 'Ask before running a tool', terms: 'confirm approval ask permission autoriser demander confirmer avant' },
  { page: 'approvals', where: 'Tools', title: 'Approval history', terms: 'approval allowed refused autorisations refusé permission historique' },
  { page: 'advanced', where: 'Advanced', title: 'Connection and send queue', terms: 'state queue file d\'attente état connexion' },
  { page: 'diagnostics', where: 'Advanced', title: 'Diagnostics', terms: 'logs debug crash journaux dépannage troubleshooting' },
  { page: 'config', where: 'Advanced', title: 'Raw config', terms: 'config.json json configuration fichier' },
  { page: 'setup', where: 'Advanced', title: 'Get started', terms: 'setup assistant first run configuration initiale démarrage' },
];

/** Lowercase, without accents: "thème" and "theme" are the same word to someone typing fast. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * The entries holding every word typed, those whose title matches first. A word matches the start
 * of a word, so "voi" finds "voice" and "voix" but "ice" finds nothing.
 */
export function searchSettings(query: string, nativeApp: boolean): SettingsEntry[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const hits: Array<{ entry: SettingsEntry; inTitle: boolean }> = [];
  for (const entry of SETTINGS_ENTRIES) {
    if (entry.nativeOnly && !nativeApp) continue;
    const title = fold(entry.title).split(/[^a-z0-9.]+/);
    const all = [...title, ...fold(`${entry.where} ${entry.terms}`).split(/[^a-z0-9.]+/)];
    if (!words.every(word => all.some(term => term.startsWith(word)))) continue;
    hits.push({ entry, inTitle: words.every(word => title.some(term => term.startsWith(word))) });
  }
  return [...hits.filter(hit => hit.inTitle), ...hits.filter(hit => !hit.inTitle)].map(hit => hit.entry);
}
