// runner
function({min,max,r,p,B}) {
  for (let i = min; i < max; i++) {
    if (modExp(r,i,p) == B) return i;
  }
  return false;

  function modExp(a, b, m) {
    a = a % m;
    var result = 1n;
    var x = a;
    while (b > 0) {
        var leastSignificantBit = b % 2n;
        b = b / 2n;
        if (leastSignificantBit == 1n) {
            result = result * x;
            result = result % m;
        }
        x = x * x;
        x = x % m;
    }
    return result;
  }
}

// generator
function({batch,step,p,r,B, offset}) {
  const next = step*batch + offset;
  if (next > p) return true; // done

  console.log(`${next}/${p} (${Math.round(next/p * 1000)/10}%)`)

  return {
    min: BigInt(next),
    max: BigInt(Math.min(p,next+step)),
    p: BigInt(p),
    r: BigInt(r),
    B: BigInt(B)
  };
}

// combinator
function(input,output) {
  return output
}
