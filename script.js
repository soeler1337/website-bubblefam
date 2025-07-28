let accessToken
let clientId
async function fetchAccessToken() {
  const response = await fetch('https://soeler-twitch-proxy.vercel.app/api/token');
  const data = await response.json();

  accessToken = data.access_token;
  clientId = data.clientId
}

async function loadStatus() {
  const table = document.getElementById('streamer-table');
  table.innerHTML = '<tr><td colspan="5">Lade...</td></tr>';
  await fetchAccessToken();

  const usernames = streamerList.map(s => s.twitchName.toLowerCase().split('?')[0]).filter(Boolean);
  const headers = {
    'Client-ID': clientId,
    'Authorization': `Bearer ${accessToken}`
  };

  const chunks = [];
  for (let i = 0; i < usernames.length; i += 100) {
    chunks.push(usernames.slice(i, i + 100));
  }

  let allStreams = [];
  for (const chunk of chunks) {
    const params = chunk.map(u => `user_login=${encodeURIComponent(u)}`).join('&');
    const res = await fetch(`https://api.twitch.tv/helix/streams?${params}`, { headers });
    const data = await res.json();
    allStreams = allStreams.concat(data.data);
  }

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
      <td><a href="https://www.twitch.tv/${username}" target="_blank">Twitch</a></td>
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

setInterval(loadStatus, 300000);
window.addEventListener('DOMContentLoaded', loadStatus);