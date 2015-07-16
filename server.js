var http = require('http');
var https = require('https');
var path = require('path');
var Promise = require('promise');
var fs = require('fs');

var express = require('express');

var app = express();
var server = http.createServer(app);

var requirejs = require('requirejs');
var omnyBaseUrl = "ui/public_html/";

var nodeRequire = require;

var React = require('react');
var start = new Date().getTime();
var log = console.log;
console.log=function() {
  var current = new Date().getTime() - start;
  var message = Array.prototype.slice.call(arguments);
  message.unshift(current);
  log.apply(this,message);
}

var requireJsPaths = {
  "jquery": 'lib/jquery',
  "jqueryui": 'lib/jquery-ui/js/jquery-ui',
  "react": "lib/react/react",
  "ext": "https://modules.omny.ca"
}

requirejs.config({
    nodeRequire: nodeRequire,
    baseUrl: omnyBaseUrl+'js',
    waitSeconds: 20,
    jsx: {
        fileExtension: '.jsx',
        harmony: true
    },
    config: {
        text: {
            useXhr: function (url, protocol, hostname, port) {
                return true;
            }
        }
    },
    paths: requireJsPaths
});



function getProtocolFetcher(url) {
  if(url.indexOf("https://")==0) {
    return https;
  }
  return http;
}



var globalFilePromises = {};
var remoteRegex = /((jsx)!)?(http(s)?:[/][/])?([^/]+)[/](.+)/;

function getAdjustedUrl(url) {
  var prefix = "";
  var remainingUrl = url;
  var match = remoteRegex.exec(url);
  if(match && match[1]) {
    prefix = match[1];
    remainingUrl = url.substring(prefix.length);
  }
  for(var key in requireJsPaths) {
    if(requireJsPaths[key].indexOf("http")==0&& remainingUrl.indexOf(key+"/")==0) {
      return prefix+requireJsPaths[key] + remainingUrl.substring(key.length);
    }
  }
  return url;
}

requirejs(["utilities/Guid"], function(guid) {
  require = function(dependencies, callback) {
    var filePromises = {};
    var promises = [];
    var localDependencies = [];
    for(var i=0; i<dependencies.length; i++) {
      var localDependency = dependencies[i];
      var localName = dependencies[i];
      var remoteUrl = getAdjustedUrl(dependencies[i]);
      var match = remoteRegex.exec(localDependency);
      var remote = false;
      if(match && match[3]) {
        remoteUrl = match[3]+match[5]+"/"+match[6];
        remote = true;
        if(match[1]) {
          remoteUrl += "."+match[2];
        }
      }
      
      if(typeof filePromises[dependencies[i]]=="undefined") {
        filePromises[dependencies[i]] = new Promise(function (fulfill, reject) {
          if(!remote) {
            fulfill(localDependency);
          } else {
            //download it locally
            
            var request = getProtocolFetcher(remoteUrl).get(remoteUrl, function(response) {
              var etag ="";
              if(response.headers.etag) {
                etag = response.headers.etag.replace(/[^a-zA-Z0-9-]/g, '');;
              }
              localName = "/tmp/files_"+match[5]+"_"+etag+match[6].replace("/","_");
              var cache = cacheIndefinitely(remoteUrl);
              if(!cache) {
                localName = "/tmp/"+guid.guid();
              }
              localDependency = localName;
              
              if(match[1]) {
                localDependency = match[1] + localName;
                localName += "."+match[2];
              }
              
              if(cache) {
                if(typeof globalFilePromises[localName]!="undefined") {
                  globalFilePromises[localName].then(function() {
                    var args = Array.prototype.slice.call(arguments)[0];
                    fulfill(args);
                  })
                  return;
                } else {
                  var outerFulfill = fulfill;
                  globalFilePromises[localName] = new Promise(function (fulfill, reject) {
                    var file = fs.createWriteStream(localName);
                    response.pipe(file);
                    response.on('end', function() {
                      fulfill(localDependency);
                      outerFulfill(localDependency);
                    });
                  });
                  return;
                }
              }
              
              fs.exists(localName, function(exists) {
                if(exists) {
                  fulfill(localDependency);
                } else {
                  var file = fs.createWriteStream(localName);
                  response.pipe(file);
                  response.on('end', function() {
                    fulfill(localDependency);
                  });
                }
              });
              
            });
          }
        });
      }
      
      promises.push(filePromises[dependencies[i]]);
      
    }
    Promise.all(promises).then(function() {
      var dependencies = Array.prototype.slice.call(arguments)[0];
      requirejs(dependencies,callback);
    }, function(err) {
      
    });
  }
  
  function cacheIndefinitely(url) {
    return true;
  }
  var count = 3;
  function loadPage(url) {
    require([url,url], function(helloWorld) {
      count--;
      if(count>0) {
        loadPage(url);
      }
      console.log(helloWorld);
      var h =  new helloWorld({},false,"a",null);
      h.loadCacheProperties().then(function(properties) {
        var html = h.renderToString(properties);
        console.log(html);
        console.log(properties);
      });
    });
  }
  
  app.get('/', function (req, res) {
    res.send('Hello World!');
  });
  
  server.listen(process.env.PORT || 3000, process.env.IP || "0.0.0.0", function(){
    var addr = server.address();
    console.log("server listening at", addr.address + ":" + addr.port);
  });
  
  loadPage("jsx!https://omny-ui-modules-alamarre-2.c9.io/HelloWorldSsr/HelloWorldSsr");
});


