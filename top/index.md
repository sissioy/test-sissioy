---
title: 文章阅读量排行榜
type: top
date: 2020-03-17 10:11:37
comments: false
keywords: top,文章阅读量排行榜
description: 博客文章阅读量排行榜
---

<style>.post-description { display: none; }</style>

<div id="top"></div>
<script src="https://cdn1.lncld.net/static/js/av-core-mini-0.6.4.js"></script>
<script>AV.initialize("PNS4giXtrg20IMnwK4FkySYk-gzGzoHsz", "OFT996P6mikqInfTWwlvVef7");</script> 

<script type="text/javascript">
  var time=0
  var title=""
  var url=""
  var query = new AV.Query('Counter');
  query.notEqualTo('id',0);
  query.descending('time'); //结果按阅读次数降序排序
  query.limit(1000); //最终只返回1000条结果
  query.find().then(function (todo) {
    for (var i=0;i<1000;i++){
      var result=todo[i].attributes;
      time=result.time;
      title=result.title;
      url=result.url;
      var content="<p>"+"<font color='#1C1C1C'>"+"【文章热度:"+time+"℃】"+"</font>"+"<a href='"+"https://www.sissioy.com"+url+"'>"+title+"</a>"+"</p>";
      document.getElementById("top").innerHTML+=content
    }
  }, function (error) {
    console.log("error");
  });
</script>