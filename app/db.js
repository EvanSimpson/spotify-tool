var Promise = require("es6-promise").Promise;
var moment = require("moment");

var Datastore = require("nedb")
  , db = new Datastore({ filename: "data/user.db", autoload: true });

exports.loadUsers = function() {
  return new Promise(function(resolve, reject) {
    db.find({}, function(err, docs) {
      if ( err ) {
        reject(err);
      }
      resolve(docs);
    });
  });
}

exports.saveUser = function(user, name, id) {
  return new Promise(function(resolve, reject) {
    db.update(user, { $set: { name: name, spotifyId: id } }, {},
      function(err, count){
        if ( err ) {
          reject(err);
        }
        user.name = name;
        user.spotifyId = id;
        resolve(user);
      });
  })
}

exports.saveCredentials = function(user, authData) {
  var expirationDate = moment()
    .add(Number(authData.expiration), "seconds").toDate();
  return new Promise(function(resolve, reject) {
    db.update(user, { $set: { accessToken: authData.accessToken,
      expiration: expirationDate,
      refreshToken: authData.refreshToken || null
    } }, {}, function(err, count) {
      if ( err ) {
        reject(err);
      }
      user.accessToken = authData.accessToken,
      user.expiration = expirationDate,
      user.refreshToken = authData.refreshToken
      resolve(user);
    });
  });
}

exports.createUser = function(authData) {
  var expirationDate = moment()
    .add(Number(authData.expiration), "seconds").toDate();
  return new Promise(function(resolve, reject) {
    db.insert({
      accessToken: authData.accessToken,
      expiration: expirationDate,
      refreshToken: authData.refreshToken
    }, function(err, user){
        if ( err ) {
          reject(err);
        }
        resolve(user);
      });
  });
}
