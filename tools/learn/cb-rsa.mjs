// Landing page for the Cookbook RSA sample. Every calculation of this sheet is in Python, which the engine run used for
// quoting cannot compute, so the page quotes no engine values and describes the steps in words.
export default ({ V }) => ({
    slug: 'rsa-encryption-worked-example',
    label: 'RSA worked example',
    group: 'calculator',
    area: 'computing',
    title: 'RSA encryption worked example, step by step',
    description: 'RSA step by step with a small key: primes, totient, private exponent, exact big integers, encrypt, decrypt, sign and break it. A teaching example, not secure.',
    h1: 'RSA encryption worked example with a small key',
    schema: [],
    open: 'cookbook-rsa',
    video: V.first,
    related: ['engineering-calculations-with-units', 'engineering-calculation-software-free', 'calcpad-online'],
    howto: 'How to follow a worked RSA example in a calculation sheet',
    runs: {},
    lead: `<p>This sheet builds a complete toy RSA key pair and uses it. It finds two primes, forms the modulus and the totient, works out the private exponent, then encrypts, decrypts, signs and verifies a message, and finally breaks its own key to show why a small modulus is useless. Everything is whole-number arithmetic with remainders, done with exact big integers, so no digit is rounded away.</p>
<p><strong>It is for learning, not for security.</strong> The key is 61 bits long where real keys are 2048 bits or more, there is no padding, and the message is a bare number. Never use it to protect anything.</p>`,
    sections: [
        ['The idea in one paragraph', `<p>Work with remainders modulo n = p q, where p and q are secret primes. For a message m with no common factor with n, Euler's theorem says m raised to the totient is 1 modulo n, where the totient is (p - 1)(q - 1). Choose a public exponent e and a private exponent d so that e d leaves remainder 1 when divided by the totient. Then raising to e and then to d returns the message. Anyone can lock with (e, n). Only the holder of d can unlock, because finding d from n and e needs the factors of n.</p>`],
        ['What the sheet does, section by section', `<ol>
<li><strong>Primes.</strong> A Miller-Rabin test written in Python checks that the two chosen numbers are prime. With the first twelve primes as bases it is deterministic for numbers of this size. A helper called <code>modpow</code> does square and multiply, so the exponent costs one squaring per bit.</li>
<li><strong>The key pair.</strong> The modulus n = p q, the totient (p - 1)(q - 1), the usual public exponent e = 65537, and the private exponent found with the extended Euclidean algorithm. The sheet checks that the gcd is 1 and that e d has remainder 1 modulo the totient.</li>
<li><strong>Encrypt and decrypt.</strong> The ciphertext is m^e mod n and decryption is c^d mod n. A check confirms the round trip.</li>
<li><strong>More messages.</strong> A table of messages, including 0, 1 and the largest allowed value, and a plot showing that consecutive messages encrypt to unrelated numbers.</li>
<li><strong>A signature.</strong> The same operation turned around: raise a fingerprint to the private exponent, then undo it with the public exponent. A changed document or a tampered signature fails.</li>
<li><strong>Why the toy is a toy.</strong> Pollard's rho method factors the modulus, rebuilds the private exponent and reads the message.</li>
</ol>`],
        ['Which results come from where', `<p>All the arithmetic on this page runs in Python blocks inside the sheet, so this page quotes no computed numbers. The sheet's own calculation lines, at the end, only collect two values that the Python blocks export: the count of failed checks and the number of Pollard rho steps needed to break the key. The sheet prints a single line saying whether all the RSA checks passed.</p>
<p>The Python needs your permission. When you open the sheet the app asks before it runs the code, once for each tab. The blocks share one session, and each has a time limit of 10 seconds.</p>`],
        ['The PASS and FAIL lines', `<p>Every step ends with checks that print PASS or FAIL. They include: both primes pass the test, e and the totient share no factor, e d has remainder 1 modulo the totient, Fermat's and Euler's theorems hold for the chosen numbers, the round trip recovers the message, every test message round-trips, the signature verifies while a changed document and a tampered signature do not, and the factors found by Pollard's rho are exactly p and q. If any line says FAIL the result line at the bottom says so too.</p>`],
        ['What this is, and is not', `<div class="note">
<p><strong>This is a worked, self-checking example. It is for learning and checking ideas, not for security.</strong> Textbook RSA with a tiny key is not secure. There is no padding, no hashing of the document before signing, and the primes are chosen as the next prime after a fixed starting number rather than at random. It is not a design tool and not a certified program.</p>
<p>The problems follow the cookbook of the symplex library (MIT or Apache-2.0), rewritten for Calcs. The library is at <a href="https://github.com/cgorski/symplex">github.com/cgorski/symplex</a>.</p>
</div>`],
        ['Things to change', `<ul>
<li>Start from larger primes, for example from ten billion, and watch the break take longer. Its cost grows with the square root of the smaller prime.</li>
<li>Set <code>e = 3</code> in the key section. The gcd check fails and the inverse raises an error, because 3 divides p - 1, so there is no inverse modulo the totient.</li>
<li>Encrypt a message larger than n. It comes back reduced modulo n, not as you sent it.</li>
<li>Sign a different fingerprint, or change the signature by one, and watch verification fail.</li>
</ul>`],
    ],
    steps: [
        ['Open the sheet', 'Choose <strong>Open this sheet in Calcs</strong> on this page. The sheet opens in a new tab of CivilKit Calcs.'],
        ['Allow Python', 'The app asks permission to run the Python blocks once for each tab. Allow it to see the results.'],
        ['Read the PASS lines', 'Scroll down each section and read what it checks, then edit a value in a block and run it again.'],
    ],
    faq: [
        ['Is this RSA example secure?', 'No. The key is 61 bits long where real keys are 2048 bits or more, there is no padding and the message is a bare number. The sheet breaks its own key in its last section.'],
        ['How is the private exponent found?', 'With the extended Euclidean algorithm. It gives integers x and y with e x + totient y equal to the gcd. When the gcd is 1, x reduced modulo the totient is the private exponent.'],
        ['Why use exact big integers?', 'The numbers involved have far more digits than a floating point value can hold. Python integers are exact, so every remainder is correct and the checks mean something.'],
        ['Why does the sheet need Python?', 'All the RSA arithmetic is written in Python blocks. The app asks permission to run them once for each tab.'],
        ['What does the 3-argument pow do here?', 'It is used only to cross-check the sheet\'s own square and multiply routine, which does the same job step by step so you can see how few multiplications a large exponent needs.'],
    ],
});
