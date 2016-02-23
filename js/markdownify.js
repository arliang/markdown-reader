(function(document) {

    var interval, 
        defaultReloadFreq = 3,
        previousText,
        storage = localStorage;

    function parseMatchPattern(input) {
        if (typeof input !== 'string') {
            return null;
        }
        var match_pattern = '(?:^', 
            regEscape = function(s) {return s.replace(/[[^$.|?*+(){}\\]/g, '\\$&');},  
            result = /^(\*|https?|file|ftp|chrome-extension):\/\//.exec(input);

        // Parse scheme
        if (!result) {
            return null;
        }

        input = input.substr(result[0].length);
        match_pattern += result[1] === '*' ? 'https?://' : result[1] + '://';

        // Parse host if scheme is not `file`
        if (result[1] !== 'file') {
            if (!(result = /^(?:\*|(\*\.)?([^\/*]+))/.exec(input))) return null;
            input = input.substr(result[0].length);
            if (result[0] === '*') {    // host is '*'
                match_pattern += '[^/]+';
            } else {
                if (match[1]) {         // Subdomain wildcard exists
                    match_pattern += '(?:[^/]+\.)?';
                }
                // Append host (escape special regex characters)
                match_pattern += regEscape(match[2]) + '/';
            }
        }

        // Add remainder (path)
        match_pattern += input.split('*').map(regEscape).join('.*');
        match_pattern += '$)';
        return match_pattern;
    }

    // Onload, take the DOM of the page, get the markdown formatted text out and
    // apply the converter.
    function makeHtml(data) {
        storage_get('mathjax').then(function(items) {
            // if(items.mathjax) {
            //     data = data.replace(/\\\(/g, "\\\\(");
            //     data = data.replace(/\\\)/g, "\\\\)");
            //     data = data.replace(/\\\[/g, "\\\\[");
            //     data = data.replace(/\\\]/g, "\\\\]");
            // }

            marked.setOptions({
                highlight : function(code) {
                    return hljs.highlightAuto(code).value;
                }
            });
            var html = marked(data);
            $(document.body).html(html);

            // if (items.mathjax) {
            //     // Inject js to reload MathJax
            //     var js = $('<script/>').attr('type', 'text/javascript')
            //         .attr('src', 'js/runMathJax.js');
            //     $(document.head).append(js);
            // }
        });
    }

    function getThemeCss(theme) {
        return 'theme/' + theme + '.css';
    }

    function setTheme(theme) {
        var defaultThemes = ['Clearness', 'ClearnessDark', 'Github', 'TopMarks', 'myTheme'];

        if($.inArray(theme, defaultThemes) != -1) {
            var link = $('#theme');
            $('#custom-theme').remove();
            if(!link.length) {
                var ss = document.createElement('link');
                ss.rel = 'stylesheet';
                ss.id = 'theme';
                //ss.media = "print";
                ss.href = getThemeCss(theme);
                document.head.appendChild(ss);
            } else {
                link.attr('href', getThemeCss(theme));
            }
        } else {
            var themePrefix = 'theme_',
                key = themePrefix + theme;
            storage_get(key).then(function(items) {
                if(items[key]) {
                    $('#theme').remove();
                    var theme = $('#custom-theme');
                    if(!theme.length) {
                        var style = $('<style/>').attr('id', 'custom-theme')
                                        .html(items[key]);
                        $(document.head).append(style);
                    } else {
                        theme.html(items[key]);
                    }
                }
            });
        }
    }

    function setMathJax() {
        var mjc = $('<script/>').attr('type', 'text/x-mathjax-config')
            .html("MathJax.Hub.Config({tex2jax: {inlineMath: [ ['$','$'], ['\\\\(','\\\\)'] ],processEscapes:true}});");
        $(document.head).append(mjc);
        var js = $('<script/>').attr('type','text/javascript')
            .attr('src', 'http://cdn.mathjax.org/mathjax/latest/MathJax.js?config=TeX-AMS_HTML');
        $(document.head).append(js);
    }

    function stopAutoReload() {
        clearInterval(interval);
    }

    function startAutoReload() {
        stopAutoReload();

        var freq = defaultReloadFreq;
        storage_get('reload_freq').then(function(items) {
            if(items.reload_freq) {
                freq = items.reload_freq;
            }
        });

        interval = setInterval(function() {
            $.ajax({
                url : location.href, 
                cache : false,
                success : function(data) { 
                    if (previousText == data) {
                        return;
                    }
                    makeHtml(data); 
                    previousText = data;
                }
            });
        }, freq * 1000);
    }

    function render(url) {
        $.ajax({
            url : url, 
            cache : false,
            complete : function(xhr, textStatus) {
                var contentType = xhr.getResponseHeader('Content-Type'),
                    content = xhr.responseText;
                if(contentType && (contentType.indexOf('html') > -1)) {
                    return;    
                }

                makeHtml(content);
                var specialThemePrefix = 'special_',
                    pageKey = specialThemePrefix + location.href;
                storage_get(['theme', pageKey]).then(function(items) {
                    theme = items.theme ? items.theme : 'myTheme';
                    if(items[pageKey]) {
                        theme = items[pageKey];
                    }
                    setTheme(theme);
                });

                // storage_get('auto_reload').then(function(items) {
                //     if(items.auto_reload) {
                //         startAutoReload();
                //     }
                // });
            }
        });
    }
    
    function storage_get(query){
        return $.Deferred(function(defer){
            var result;
            if($.isArray(query)){
                result = [];
                $.each(query, function(){
                    result.push(localStorage.getItem(this));
                });
            } else {
                result = localStorage.getItem(query);
            }
            defer.resolve(result);
        })
    }
    
    storage_get(['exclude_exts', 'disable_markdown', 'mathjax']).then(function(items) {
        var url;
        if(location.hash){
            url = location.hash.replace(/^#/, '');
        } else {
            url = 'README.md';   
        }

        if(items.disable_markdown) {
            return;
        }

        if(items.mathjax) {
            setMathJax();
        }

        var exts = items.exclude_exts;
        if(!exts) {
            render(url);
            return;
        }

        var parsed = $.map(exts, function(k, v) {
            return parseMatchPattern(v);
        });
        
        var pattern = new RegExp(parsed.join('|'));
        if(!parsed.length || !pattern.test(location.href)) {
            render(url);
        }
    });

}(document));
