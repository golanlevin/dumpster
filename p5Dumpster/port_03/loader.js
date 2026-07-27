var Files = {};

//------------------------------------------------------------
function loadImageLossless(url,callback){
  // Get rid of premultiplied alpha:
  // https://stackoverflow.com/a/60564905
  var img = new Image();
  img.src = url;
  img.addEventListener('load', function () {
    let canvas = document.createElement('canvas');
    let gl = canvas.getContext("webgl2");
    if (!gl){
      gl = canvas.getContext("webgl");
    }
    // monkey patch safari drawBuffers
    // https://stackoverflow.com/a/37071729
    if (!gl.drawBuffers){
      var ext = gl.getExtension("WEBGL_draw_buffers");
      if (!ext) {
        console.log("Error: WEBGL_draw_buffers extension not available.");
      } 
      for (var key in ext) {
        var value = ext[key];
        if (typeof value === 'function') {
          value = value.bind(ext);
        }
        var newKey = key.replace(/_?WEBGL/, '');
        gl[newKey] = value;
      }
    }
    gl.activeTexture(gl.TEXTURE0);
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    let data = new Uint8Array(this.width * this.height * 4);
    gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    callback(data);
  });
}

//------------------------------------------------------------
function loadClips(callback){
  var startTime = performance.now();
  loadImageLossless("data/all_dumpster_texts.png", function(data8){
    // console.log(data8);

    var i = 0;
    var words = [];
    while (i < data8.length){
      // var kase = -1;
      // var i0 = i;
      if (data8[i] & 0b10000000){
        // kase = 1;
        var w = VOCAB[data8[i]&0b01111111];
        if (w == "<EOF>"){
          var txt = "";
          var nosp = {".":1,",":1,"!":1,"?":1};
          for (var j = 0; j < words.length; j++){
            if (j && !nosp[words[j][0]]){
              txt += " ";
            }
            txt += words[j];
          }
          // console.log(FILENAMES[0],txt);
          Files[FILENAMES[0]] = txt;
          
          // if (Object.keys(Files).length > 776){
          //   console.log(FILENAMES[0],txt);
          //   return;
          // }

          words = [];
          FILENAMES.shift();
          if (!FILENAMES.length){
            break;
          }
          // console.log(JSON.stringify(Files));
          // return;

        } else if (w == "<NL>"){
          words.push("\n");
        } else {
          words.push(w);
        }
      } else if (data8[i+1] & 0b10000000){
        // kase = 2;
        var b0 = data8[i]&0b01111111;
        var b1 = data8[i+1]&0b01111111;
        var b = (b0 << 7) | b1;
        var w = VOCAB[b+128];
        words.push(w);
        i++;
      } else {
        // kase = 3;
        var w = ""
        while (data8[i] != 0){
          w += String.fromCharCode(data8[i]);
          i++;
        }
        words.push(w);
      }
      // console.log(i0,kase,words);
      i++;
    }
    var dur = performance.now()-startTime;
    console.log(`Loaded Dumpster breakup texts in ${dur/1000} seconds.`)
    // console.log(Object.keys(Files).length)
    if (callback) callback(Files);
  });
}