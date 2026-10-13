// Plomberie partagee par les cinq inspecteurs.
//
// WebSocket brut, sans bibliotheque : les inspecteurs de Stream Deck sont des
// pages locales, et une dependance CDN les laisserait vides des que le Mac
// demarre sans reseau — ce qui est exactement le moment ou l'on regle ses
// touches apres un redemarrage.

export const PI = {
  uuid: null,
  action: null,
  socket: null,
  reglages: {},
  globaux: {},
  _surReglages: () => {},
  _surGlobaux: () => {},
  _surPlugin: () => {},
};

export function demarrer({ surReglages, surGlobaux, surPlugin } = {}) {
  PI._surReglages = surReglages ?? (() => {});
  PI._surGlobaux = surGlobaux ?? (() => {});
  PI._surPlugin = surPlugin ?? (() => {});

  // Le 5e argument porte l'UUID de l'action reglee. Sans lui, `sendToPlugin`
  // part sans destinataire et le plugin ne recoit jamais la demande de liste.
  window.connectElgatoStreamDeckSocket = (port, pluginUUID, registerEvent, _infos, infosAction) => {
    PI.uuid = pluginUUID;
    PI.action = (typeof infosAction === 'string' ? JSON.parse(infosAction) : infosAction)?.action ?? null;
    PI.socket = new WebSocket('ws://127.0.0.1:' + port);
    PI.socket.onopen = () => {
      envoyerBrut({ event: registerEvent, uuid: PI.uuid });
      envoyerBrut({ event: 'getGlobalSettings', context: PI.uuid });
      envoyerBrut({ event: 'getSettings', context: PI.uuid });
    };
    PI.socket.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.event === 'didReceiveSettings') {
        PI.reglages = data.payload?.settings ?? {};
        PI._surReglages(PI.reglages);
      }
      if (data.event === 'didReceiveGlobalSettings') {
        PI.globaux = data.payload?.settings ?? {};
        PI._surGlobaux(PI.globaux);
      }
      if (data.event === 'sendToPropertyInspector') {
        PI._surPlugin(data.payload ?? {});
      }
    };
  };
}

function envoyerBrut(message) {
  PI.socket?.send(JSON.stringify(message));
}

export function enregistrer(modifications) {
  PI.reglages = { ...PI.reglages, ...modifications };
  envoyerBrut({ event: 'setSettings', context: PI.uuid, payload: PI.reglages });
}

export function enregistrerGlobaux(modifications) {
  PI.globaux = { ...PI.globaux, ...modifications };
  envoyerBrut({ event: 'setGlobalSettings', context: PI.uuid, payload: PI.globaux });
}

export function versPlugin(payload) {
  envoyerBrut({ event: 'sendToPlugin', context: PI.uuid, action: PI.action, payload });
}

// Bloc « connexion » commun : port et fichier de jeton, en reglages GLOBAUX.
// Il n'y a qu'une instance de PhotoCraft a piloter ; demander le jeton une fois
// par touche serait quinze occasions de se tromper.
export function monterBlocConnexion(conteneur) {
  conteneur.innerHTML = `
    <hr class="separateur">
    <div class="titre-section">Connexion a PhotoCraft</div>
    <div class="champ">
      <label for="pc-port">Port du canal</label>
      <input id="pc-port" type="number" min="1" max="65535" placeholder="7878">
    </div>
    <div class="champ">
      <label for="pc-jeton">Fichier de jeton</label>
      <input id="pc-jeton" type="text" placeholder="/Users/moi/.photocraft/control.token">
      <span class="aide">
        Lancer PhotoCraft avec <code>--control &lt;port&gt; --control-token-file &lt;chemin&gt;</code>.
        Le jeton est relu a chaque connexion : il reste valide apres un redemarrage de l'application.
      </span>
    </div>`;

  const port = conteneur.querySelector('#pc-port');
  const jeton = conteneur.querySelector('#pc-jeton');
  port.oninput = () => enregistrerGlobaux({ port: Number(port.value) || 7878 });
  jeton.oninput = () => enregistrerGlobaux({ fichierJeton: jeton.value });

  return (globaux) => {
    port.value = globaux.port ?? 7878;
    jeton.value = globaux.fichierJeton ?? '';
  };
}
