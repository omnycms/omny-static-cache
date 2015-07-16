var AWS = require('aws-sdk');
AWS.config.region = process.env.AWS_REGION || "us-east-1";
var s3 = new AWS.S3();
var sqs = new AWS.SQS();

var queue = process.env.AWS_QUEUE || "https://sqs.us-east-1.amazonaws.com/990455710365/static-cache";

var generator = require("./cachePageGenerator");

var params = {
    "QueueUrl": queue
};
for(var i=0; i<1; i++) {
    sqs.receiveMessage(params, function(err, data) {
        if(err) {
            console.log(err);
        } else {
            console.log(data.Messages.length);
            for(var current=0; current<data.Messages.length; current++) {
                var message = data.Messages[current];
                console.log(message.Body);
                var params = {
                    QueueUrl: queue,
                    ReceiptHandle: message.ReceiptHandle
                }
                sqs.deleteMessage(params);
                /*generator.getCachedString("about.omny.me","default").then(function(results) {
                    console.log("success");
                    console.log(results);
                },function(err) {
                    console.log("test");
                    console.log(err);
                });*/
            }
        }
    });
}