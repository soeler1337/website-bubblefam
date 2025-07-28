let allStreams = [];

async function fetchStreams() {
	const usernames = streamerList
	  .map(s => s.twitchName?.toLowerCase().split('?')[0])
	  .filter(Boolean);

	const response = await fetch('https://soeler-twitch-proxy.vercel.app/api/streamers', {
	  method: 'POST',
	  headers: { 'Content-Type': 'application/json' },
	  body: JSON.stringify({ usernames })
	});

	const data = await response.json();

	allStreams = data.streams
}

async function loadStatus() {
  const table = document.getElementById('streamer-table');
  table.innerHTML = '<tr><td colspan="5">Lade...</td></tr>';
  
  await fetchStreams();

  const liveMap = {};
  allStreams.forEach(s => {
    liveMap[s.user_login.toLowerCase()] = s;
  });

  table.innerHTML = '';
  streamerList.forEach(s => {
    const username = s.twitchName.toLowerCase().split('?')[0];
    const live = liveMap[username];
    const tr = document.createElement('tr');
    tr.className = live ? 'online' : 'offline';
    tr.innerHTML = `
      <td><span class="status-dot ${live ? 'online-dot' : 'offline-dot'}"></span>${live ? 'Online' : 'Offline'}</td>
      <td>${username}</td>
      <td>${live ? live.title : ''}</td>
      <td>${live ? live.game_name : ''}</td>
      <td><a class="live-link" href="https://www.twitch.tv/${username}" target="_blank">Twitch</a></td>
    `;
    table.appendChild(tr);
  });
  sortTable(0);
}

function filterTable() {
  const input = document.getElementById("searchInput").value.toLowerCase();
  const rows = document.getElementById("streamer-table").getElementsByTagName("tr");
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(input) ? "" : "none";
  }
}

function sortTable(n) {
  const table = document.getElementById("streamTable");
  let switching = true;
  let dir = "desc";
  let switchcount = 0;
  while (switching) {
    switching = false;
    const rows = table.rows;
    for (let i = 1; i < rows.length - 1; i++) {
      const x = rows[i].getElementsByTagName("TD")[n];
      const y = rows[i + 1].getElementsByTagName("TD")[n];
      let shouldSwitch = false;
      if (dir === "asc" && x.textContent.toLowerCase() > y.textContent.toLowerCase()) {
        shouldSwitch = true;
      } else if (dir === "desc" && x.textContent.toLowerCase() < y.textContent.toLowerCase()) {
        shouldSwitch = true;
      }
      if (shouldSwitch) {
        rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
        switching = true;
        switchcount++;
        break;
      }
    }
    if (!switching && switchcount === 0 && dir === "asc") {
      dir = "desc";
      switching = true;
    }
  }
}
function showPopup() {
  const onlineRows = document.querySelectorAll('tr.online');
  if (onlineRows.length === 0) {
    alert("Es sind derzeit keine Streamer online.");
    return;
  }

  const overlay = document.createElement('div');
  overlay.style = `
      position: fixed;
	  top: 50%;
	  left: 50%;
	  transform: translate(-50%, -50%);
	  background-color: #37153A;
	  padding: 2rem;
	  border-radius: 12px;
	  z-index: 9999;
	  max-height: 90vh;
	  overflow-y: auto;
	  width: 90%;
	  max-width: 900px;
	  box-shadow: 0 0 10px rgba(0,0,0,0.3);
  `;

  const box = document.createElement('div');
  box.style = `
 
  `;
	box.innerHTML = `
	  <h2 style="margin-top: 0;">Online-Streams</h2>
	  <div id="stream-select-list" style="margin-bottom: 1rem;"></div>
	  <div style="margin-top: 1rem;">
		<button class="popup-btn" id="select-toggle">Alle abwählen</button>
		<button class="popup-btn" id="open-selected">Jetzt Lurken</button>
		<button class="popup-btn" onclick="document.body.removeChild(document.getElementById('popup-overlay'));">Schließen</button>
	  </div>
	`;

  overlay.id = 'popup-overlay';
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  const list = document.getElementById('stream-select-list');
  const selectedRows = new Set();

  onlineRows.forEach(row => {
    const name = row.querySelector('td:nth-child(2)')?.textContent.trim();
    const url = row.querySelector('a')?.href;
    if (name && url) {
      const entry = document.createElement('div');
      entry.className = 'popup-stream-entry';
      entry.textContent = name;
      entry.style = `
        padding: 0.5rem 1rem;
        border-radius: 8px;
        margin-bottom: 0.5rem;
        cursor: pointer;
        background-color: rgba(150, 221, 220, 0.15);
        transition: background-color 0.2s;
      `;

      entry.onclick = () => {
        if (selectedRows.has(url)) {
          selectedRows.delete(url);
          entry.style.backgroundColor = 'rgba(150, 221, 220, 0.15)';
        } else {
          selectedRows.add(url);
          entry.style.backgroundColor = 'var(--thulian-pink)';
        }
      };

      // Vorauswahl
      selectedRows.add(url);
      entry.style.backgroundColor = 'var(--thulian-pink)';

      list.appendChild(entry);
    }
  });

  // Toggle Button
  const toggleButton = document.getElementById('select-toggle');
  toggleButton.onclick = () => {
    const allSelected = selectedRows.size === list.children.length;
    selectedRows.clear();
    [...list.children].forEach(entry => {
      const url = onlineRows[[...list.children].indexOf(entry)]?.querySelector('a')?.href;
      if (!allSelected && url) {
        selectedRows.add(url);
        entry.style.backgroundColor = 'var(--thulian-pink)';
      } else {
        entry.style.backgroundColor = 'rgba(150, 221, 220, 0.15)';
      }
    });
    toggleButton.textContent = allSelected ? "Alle auswählen" : "Alle abwählen";
  };

  // Öffne Links
  document.getElementById('open-selected').onclick = () => {
    if (selectedRows.size === 0) {
      alert("Bitte mindestens einen Stream auswählen.");
      return;
    }
    [...selectedRows].forEach(url => window.open(url, '_blank'));
    document.body.removeChild(overlay);
  };
}



setInterval(loadStatus, 300000);
window.addEventListener('DOMContentLoaded', loadStatus);