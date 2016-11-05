var querystring = require("querystring");
var open = require("open");
var http = require("http");
var url = require("url");
var request = require("superagent");
var Promise = require("es6-promise").Promise;
var EventEmitter = require("events");
var util = require("util");

var endpoint = "https://api.spotify.com";
var accountsEndpoint = "https://accounts.spotify.com";

// Start server on :8888
// Open browser to Spotify Auth request page
// Accept redirect at :8888, grab auth code from query params
// Send browser page with script tag to window.close()
// Request Access Token from Spotify
// Do cool stuff with playlists

function base64Auth() {
  return new Buffer(
    process.env.SPOTIFY_CLIENT_ID + ":" + process.env.SPOTIFY_CLIENT_SECRET
  ).toString('base64');
}

function SpotifyLib() {
  EventEmitter.call(this);
}

util.inherits(SpotifyLib, EventEmitter);

SpotifyLib.prototype.init = function() {
  var self = this;
  self.server = http.createServer(function(req, res) {
    var queryData = url.parse(req.url, true).query;
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end("<html><body><script>window.close()</script></body></html>");
    if (queryData.hasOwnProperty("code")) {
      self.authCode = queryData.code;
      self.server.close();
      self.emit("authorized");
    }
  });
}

SpotifyLib.prototype.startServer = function() {
  var self = this;
  self.server.listen(8888, function() {
    self.emit("ready");
  });
}

SpotifyLib.prototype.getAuthCode = function() {
  var query = querystring.stringify({
    response_type: 'code',
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: "playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private",
    redirect_uri: "http://localhost:8888/login"
  });
  open(accountsEndpoint + "/authorize/?" + query);
}

SpotifyLib.prototype.requestAccessToken = function(refreshToken) {
  var self = this;
  var credential = self.authCode;
  if ( refreshToken !== undefined ) {
    credential = refreshToken;
  }
  return new Promise(function(resolve, reject) {
    request
      .post(accountsEndpoint + "/api/token")
      .send("grant_type=authorization_code")
      .send("code=" + credential)
      .send("redirect_uri=http://localhost:8888/login")
      .set("Authorization", "Basic " + base64Auth())
      .end(function(err, res) {
        if (res.ok) {
          // res.body also contains expires_in (seconds),
          // a refresh_token, and token_type which is
          // always "Bearer"
          self.accessToken = res.body.access_token;
          resolve({
            accessToken: res.body.access_token,
            expiration: res.body.expires_in,
            refreshToken: res.body.refresh_token
          });
        } else {
          reject(err);
        }
      });
  });
}

SpotifyLib.prototype.setToken = function(accessToken) {
  this.accessToken = accessToken;
}

SpotifyLib.prototype.setUser = function(id) {
  this.userId = id;
}

SpotifyLib.prototype.getUser = function() {
  var self = this;
  return new Promise(function(resolve, reject) {
    request
      .get(endpoint + "/v1/me")
      .set("Authorization", "Bearer " + self.accessToken)
      .end(function(err, res) {
        if (res.ok) {
          self.userId = res.body.id;
          resolve(res.body);
        } else {
          console.error("Bad user request", err);
        }
      });
  });
}

SpotifyLib.prototype.getPlaylists = function(playlistId) {
  var self = this;
  return new Promise(function(resolve, reject) {
    request
      .get(endpoint + "/v1/me/playlists?limit=50")
      .set("Authorization", "Bearer " + self.accessToken)
      .end(function(err, res) {
        if (res.ok) {
          resolve(
            res.body.items.map(function(playlist){
              return { value: playlist.uri, name: playlist.name}
            })
          );
        } else {
          console.error("Bad playlist request", err);
        }
      });
  });
}

SpotifyLib.prototype.createPlaylist = function(name) {
  var self = this;
  return new Promise(function(resolve, reject) {
    request
      .post("https://api.spotify.com/v1/users/" + self.userId + "/playlists")
      .send({name: name})
      .set("Authorization", "Bearer " + self.accessToken)
      .end(function(err, res) {
        if (res.ok) {
          resolve(res.body.uri);
        } else {
          console.error("Could not create playlist");
        }
      });
  });
}

SpotifyLib.prototype.getPlaylistTrackCount = function(playlist) {
  var self = this;
  var query = querystring.stringify({
    fields: "total"
  });
  var playlistId = playlist.split(":").pop();
  var url = endpoint + "/v1/users/" + self.userId + "/playlists/" + playlistId + "/tracks?" + query;
  return new Promise(function(resolve, reject) {
    request
      .get(url)
      .set("Authorization", "Bearer " + self.accessToken)
      .end(function(err, res) {
        if (res.ok) {
          resolve(res.body.total);
        } else {
          console.error(err, "Bad track count request");
        }
      });
  });
}

SpotifyLib.prototype.getPlaylistTracks = function(playlist, limit, offset) {
  var self = this;
  var query = querystring.stringify({
    fields: "items(track(uri))",
    limit: limit,
    offset: offset
  });
  var playlistId = playlist.split(":").pop();
  var url = endpoint + "/v1/users/" + self.userId + "/playlists/" + playlistId + "/tracks?" + query;
  return new Promise(function(resolve, reject){
    request
      .get(url)
      .set("Authorization", "Bearer " + self.accessToken)
      .end(function(err, res) {
        if (res.ok) {
          resolve(res.body.items.map(function(item) {
            return item.track.uri;
          }));
        } else {
          console.error(err, "Bad track request");
        }
      });
  });
}

SpotifyLib.prototype.replacePlaylistTracks = function(newPlaylist, newTracks) {
  var self = this;
  var newPlaylistId = newPlaylist.split(":").pop();
  var url = endpoint + "/v1/users/" + self.userId + "/playlists/" + newPlaylistId + "/tracks";
  return new Promise(function(resolve, reject) {
    request
      .put(url)
      .send({uris: newTracks})
      .set("Authorization", "Bearer " + self.accessToken)
      .set("Content-Type", "application/json")
      .end(function(err, res) {
        if (res.ok) {
          resolve();
        } else {
          console.error(err, "Bad playlist replace request");
        }
      });
  });
}

function getNext(next) {
  request
    .get(next)
    .set("Authorization", "Bearer " + accessToken)
    .end(function(err, res) {
      if (res.ok) {

      } else {
        console.error("Derp.");
      }
    });
}

module.exports = SpotifyLib;
