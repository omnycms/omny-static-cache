var http = require('http');
var https = require('https');
var path = require('path');
var Promise = require('promise');
GLOBAL.Promise = Promise;
var fs = require('fs');
var cheerio = require('cheerio');

var requirejs = require('requirejs');
var omnyBaseUrl = "ui/public_html/";
var apiSite =  process.env.API_SITE || "api.omny.ca";
var apiProtocol = process.env.API_PROTOCOL|| "https";

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

function cacheIndefinitely(url) {
  return true;
}
  
var requireJsLoadedPromise = new Promise(function(rjsReady, rjsReject) {


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
    rjsReady();
  });
});

function getHtmlPromise(site,page) {
  return new Promise(function(fulfill,reject) {
    //get html
    
    var htmlUrl = "https://"+site+"/"+page+".html";
    getProtocolFetcher(htmlUrl).get(htmlUrl, function(res) {
      var body = '';
      res.on('data', function(chunk) {
        body += chunk;
      });
      res.on('end', function() {
        fulfill(body);
      });
    }).on('error', function(e) {
      reject(e);
    });
  });
}

function pageDetailsPromise(site,page) {
  return new Promise(function(fulfill,reject) {
    //get html
    var path = "/api/v1.0/pages/detailed?page="+page;
    var detailsUrl = apiProtocol+"://"+apiSite+path;
    console.log(detailsUrl);
    getProtocolFetcher(detailsUrl).get({
        hostname:apiSite,
        path: path,
        headers: {
          'X-Origin': site
        }
      }, function(res) {
      var body = '';
      res.on('data', function(chunk) {
        body += chunk;
      });
      res.on('end', function() {
        fulfill(JSON.parse(body));
      });
    }).on('error', function(e) {
      reject(e);
    });
  });
}

GLOBAL.window = GLOBAL;

function getHtmlResultsPromise(modules, editable) {
  return new Promise(function(fulfill,reject) {
    var sectionInfo = {};
    var promiseCollection = [];
    console.log(modules);

      if(typeof modules!="undefined") {
          for(var section in modules) {
            sectionInfo[section] = [];
            if(modules[section].length>0) {
              for(var i=0; i<modules[section].length; i++) {
                promiseCollection.push(new Promise(function(fulfillModule, rejectModule) {
                  try {
                    var module = modules[section][i].omnyClass;
                    if(module.indexOf("Omny.")==0) {
                      module=module.substring(5);
                    }
                    var data = modules[section][i].data;
                    var loadModule = function(sectionInfo,section,module,data,fulfillModule,rejectModule) {
                      require(["modules/"+module+"/"+module], function(mod) {
                        var prom = (new mod(data)).renderToString();
                        prom.then(function(result) {
                          sectionInfo[section].push(result);
                          fulfillModule(result);
                        },rejectModule);
                      });
                    };
                    var bound = loadModule.bind(this,sectionInfo,section,module,data,fulfillModule,rejectModule);
                    bound();
                  } catch(e) {
                    rejectModule(e);
                  }
                }));
              }
            }
          }
      }
      Promise.all(promiseCollection).then(function(results) {
        fulfill(sectionInfo);
      }, reject);
    });
}
  
exports.getCachedString = function(site, page) {
  return new Promise(function(fulfill,reject) {
    //get html
    var htmlPromise = getHtmlPromise(site,page);
    var detailsPromise = pageDetailsPromise(site,page);
    //get page details /api/{{version}}/pages/detailed?access_token={{access_token}}&page={{page}}
    //render modules
    //add modules into html
    Promise.all([htmlPromise,detailsPromise,requireJsLoadedPromise]).then(function(results) {
      var pageData = results[1];
      var modulePromises =[];
      modulePromises.push(getHtmlResultsPromise(pageData.templateModules, false));
      modulePromises.push(getHtmlResultsPromise(pageData.pageModules, false));
      var sectionHtml = {};
      var html = results[0];
      
      var loadSection = function(html,moduleResults) {
        var $ = cheerio.load(html);
        var templateHtml = moduleResults[0];
        var moduleHtml = moduleResults[1];
        for(var section in templateHtml) {
          sectionHtml[section] = "";
          for(var i=0; i<templateHtml[section].length; i++) {
            sectionHtml[section] += "<div>"+templateHtml[section][i]+"</div>"
          }
          $("div[data-section="+section+"] div.omny-template-section").html(sectionHtml[section]);
        }
        for(var section in moduleHtml) {

          sectionHtml[section] = "";
          for(var i=0; i<moduleHtml[section].length; i++) {
            sectionHtml[section] += "<div>"+moduleHtml[section][i]+"</div>"
          }
          $("div[data-section="+section+"] div.omny-page-section").html(sectionHtml[section]);
        }
        fulfill($.html());
      };
      
      Promise.all(modulePromises).then(loadSection.bind(this,html), reject);
      
    }, reject);
  });
};


