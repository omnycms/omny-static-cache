var AWS = require('aws-sdk');
AWS.config.region = process.env.AWS_REGION || "us-east-1";
var s3 = new AWS.S3();
var sqs = new AWS.SQS();

var queue = process.env.AWS_QUEUE || "https://sqs.us-east-1.amazonaws.com/990455710365/static-cache";

var generator = require("./cachePageGenerator");


function receiveNextMessage() {
    var params = {
        "QueueUrl": queue,
        "MaxNumberOfMessages": 10
    };
    sqs.receiveMessage(params, function(err, data) {
        if(err) {
            console.log(err);
        } else {
            console.log(data.Messages.length);
            for(var current=0; current<data.Messages.length; current++) {
                var message = data.Messages[current];
                console.log(message.Body);
                var deleteMessageParams = {
                    QueueUrl: queue,
                    ReceiptHandle: message.ReceiptHandle
                }
                var parsedMessage = JSON.parse(message.Body);
                var site = parsedMessage.site;
                var page = parsedMessage.page;
                var bucket = parsedMessage.output.bucket;
                var key = parsedMessage.output.key;
                
                generator.getCachedString(site,page).then(function(html) {
                    console.log("success");
                    console.log(html);
                    var params = {
                      Bucket: bucket, 
                      Key: key, 
                      Body: html,
                      ContentType: "text/html"
                    };
                    s3.putObject(params,function(err,data) {
                        if(err) {
                            console.log(err);
                        } else {
                            console.log("deleting");
                            console.log(deleteMessageParams);
                            sqs.deleteMessage(deleteMessageParams, function(err,data) {
                                if(err) {
                                    console.log(err);
                                }
                            });
                        }
                    });
                },function(err) {
                    console.log("test");
                    console.log(err);
                });
            }
        }
    });
}

receiveNextMessage();