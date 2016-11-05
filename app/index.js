var generators = require("yeoman-generator");
var Actions = require("./actions");

module.exports = generators.Base.extend({
  constructor: function() {
    generators.Base.apply(this, arguments);
  },
  prompting: {
    selectUser: Actions.selectUser,
    signIn: Actions.authorize,
    selectPlaylist: Actions.getPlaylists,
    targetPlaylist: Actions.selectPlaylist,
    moveNumber: Actions.selectNumber,
    move: Actions.moveTracks
  },
  writing: {
    end: function() {
      process.exit(0);
    }
  }
});
