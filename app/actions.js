var moment = require("moment");
var playlistLib = require("../lib/autoplaylist");
var db = require("./db");

var Spotify = new playlistLib();

function signIn(yo, done) {
  // Open a browser for user to sign in to Spotify
  Spotify.on("ready", function() {
    Spotify.getAuthCode();
  });
  Spotify.on("authorized", function() {
    Spotify.requestAccessToken()
      .then(function(authData){
        saveUser(yo, authData, done);
      })
      .catch(function(err){
        setTimeout(function() {
          signIn(yo, done);
        }, 3000);
      });
  });
  Spotify.init();
  Spotify.startServer();
}

function saveUser(yo, authData, done) {
  if ( yo.options.user && authData ) {
    // if there is authData and a user, update the user's record
    db.saveCredentials(yo.options.user, authData)
      .then(function(newUser){
        Spotify.setUser(yo.options.user.spotifyId);
        yo.options.user = newUser;
        done();
      });
  } else if ( authData ) {
    // If there is just authData, save the new user and get their info
    db.createUser(authData)
      .then(function(newUser){
        Spotify.getUser()
          .then(function(user){
            db.saveUser(newUser, user.display_name, user.id)
              .then(function(completeUser) {
                yo.options.user = completeUser;
                Spotify.setUser(yo.options.user.spotifyId);
                done();
            });
          });
      });
  }
}

function promptCount(yo, done) {
  var promptOpts = [{
    type: 'input',
    name: 'playlistSize',
    message: 'How many tracks do you want your playlist to have? (Max 100)'
  }];
  yo.prompt(promptOpts, function(response) {
    if (parseInt(response.playlistSize, 10)) {
      if (parseInt(response.playlistSize, 10) < 101) {
        yo.options.playlistSize = parseInt(response.playlistSize, 10);
        done();
      } else {
        yo.log("Cannot be greater than 100");
        promptCount(yo, done);
      }
    } else {
      yo.log("Enter a number");
      promptCount(yo, done);
    }
  });
}

exports.selectUser = function() {
  var self = this;
  var done = self.async();
  db.loadUsers().then(function(users) {
    // Prompt the user to select a stored user or sign in with a new user
    if ( users.length ) {
      var options = users.map(function(user) {
        return { value: user, name: user.name };
      });
      options.push({ value: null, name: "Sign In" });
      var prompt = [{
        type: "list",
        name: "userSelection",
        message: "Select a user account or sign in.",
        choices: options
      }];
      self.prompt(prompt, function (response) {
        self.options.user = response.userSelection;
        done();
      });
    } else {
      // If there are no users to select, force them to sign in
      self.options.user = null;
      done();
    }
  });
}

exports.authorize = function() {
  var self = this;
  var done = self.async();
  if ( !self.options.user ) {
    signIn(self, done);
  } else {
    if ( self.options.user.expiration &&
      moment().isBefore(moment(self.options.user.expiration)) ) {
      // The current accessToken should still be valid and
      // we should be able to just move on to the next section
      Spotify.setUser(self.options.user.spotifyId);
      Spotify.setToken(self.options.user.accessToken);
      done();
    } else if ( self.options.user.refreshToken ) {
      // If the accessToken has already expired and there is a refreshToken
      // use the refreshToken to get a new accessToken
      Spotify.requestAccessToken(self.options.user.refreshToken)
        .then(function(authData) {
          saveUser(self, authData, done);
        })
        .catch(function(err) {
          signIn(self, done);
        });
    } else {
      // Sign in as above
      signIn(self, done);
    }
  }
}

exports.getPlaylists = function () {
  var self = this;
  var done = self.async();
  Spotify.getPlaylists()
    .then(function(playlists) {
      self.playlists = playlists;
      var prompt = [{
        type: 'list',
        name: 'playlistSelection',
        message: 'Select a playlist or your music library to source tracks from.',
        choices: playlists
      }];
      self.prompt(prompt, function (response) {
        self.options.sourcePlaylist = response.playlistSelection;
        done();
      });
    });
}

exports.selectPlaylist = function() {
  var self = this;
  var done = self.async();
  var prompt = [{
    type: 'confirm',
    name: 'targetPlaylistSelection',
    message: 'Would you like to create a new playlist to put songs into?'
  }];
  self.prompt(prompt, function(response) {
    if ( response.targetPlaylistSelection ) {
      // create new playlist
      var prompt = [{
        type: 'input',
        name: 'playlistName',
        message: 'Enter a name for your new playlist:'
      }];
      self.prompt(prompt, function(response) {
        Spotify.createPlaylist(response.playlistName)
          .then(function(targetPlaylist){
            self.options.targetPlaylist = targetPlaylist;
            done();
          });
      });
    } else {
      // offer existing playlists minus
      // source playlist as target
      var prompt = [{
        type: 'list',
        name: 'playlistSelection',
        message: 'Select a playlist to put new tracks into:',
        choices: self.playlists.filter(function(playlist) {
          return playlist.value !== self.options.sourcePlaylist;
        })
      }];
      self.prompt(prompt, function(response) {
        self.options.targetPlaylist = response.playlistSelection;
        done();
      });
    }
  });
}

exports.selectNumber = function() {
  var done = this.async();
  promptCount(this, done);
}

exports.moveTracks = function() {
  var self = this;
  var done = self.async();
  Spotify.getPlaylistTrackCount(self.options.sourcePlaylist)
    .then(function(count) {
      Spotify.getPlaylistTracks(self.options.sourcePlaylist, self.options.playlistSize, count - self.options.playlistSize)
        .then(function(tracks) {
          Spotify.replacePlaylistTracks(self.options.targetPlaylist, tracks)
            .then(function(){
              self.log("Done!");
              done();
            });
        });
    });
}
