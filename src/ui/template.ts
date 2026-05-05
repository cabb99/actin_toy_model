export const APP_HTML = String.raw`
  <div id="app">
    <aside>
      <h1>Actin bundle toy model</h1>
      <p>
        Bead-chain filaments on a hexagonal lattice with a 12-state helical face label.
        Crosslinks form only between beads whose exposed faces face each other across
        the hex bond - no torsional force, just connectivity gated by phase.
      </p>

      <div class="equation">
        Faces: D[0]=0°, D[1]=180°, D[4]=60°, D[5]=240°, D[8]=120°, D[9]=300°, others inactive.<br>
        Bead m of filament i exposes D[(m+s<sub>i</sub>) mod 12].<br>
        Crosslink (i,m)↔(j,m) allowed iff i shows direction k toward j and j shows k+3 toward i.
      </div>

      <h2>Bundle</h2>
      <div class="control"><label>Hex rings <span id="ringsVal"></span></label><input id="rings" type="range" min="1" max="6" step="1" value="2" /></div>
      <div class="control"><label>Monomers / filament <span id="monomersVal"></span></label><input id="monomers" type="range" min="24" max="400" step="4" value="96" /></div>
      <div class="control"><label>Lattice spacing a (nm) <span id="aVal"></span></label><input id="a" type="range" min="8" max="45" step="0.5" value="11.0" /></div>
      <div class="control"><label>Bead spacing b (nm, axial) <span id="bVal"></span></label><input id="b" type="range" min="2.0" max="3.5" step="0.05" value="2.75" /></div>

      <h2>Helicity &amp; registry</h2>
      <div class="control">
        <label>Registry mode</label>
        <select id="registryMode">
          <option value="perfect">Perfect (s = q + 2r)</option>
          <option value="zero">All zero (s = 0)</option>
          <option value="random">Random</option>
          <option value="custom">Custom (after MC)</option>
        </select>
      </div>
      <div class="control"><label>Saturation (per compatible site) <span id="satVal"></span></label><input id="sat" type="range" min="0" max="1" step="0.01" value="1.00" /></div>
      <div class="buttons"><button id="rebuildBtn" class="full">Rebuild crosslinks (re-roll saturation)</button></div>
      <div class="control"><label>MC starting T₀ <span id="mcT0Val"></span></label><input id="mcT0" type="range" min="0.05" max="40" step="0.05" value="8" /></div>
      <div class="control"><label>MC ending T₁ <span id="mcT1Val"></span></label><input id="mcT1" type="range" min="0.001" max="4" step="0.001" value="0.05" /></div>
      <div class="control"><label>MC iterations <span id="mcItersVal"></span></label><input id="mcIters" type="range" min="500" max="40000" step="500" value="4000" /></div>
      <div class="control"><label>MC skew penalty <span id="mcSkewVal"></span></label><input id="mcSkew" type="range" min="0" max="1" step="0.01" value="0.15" /></div>
      <div class="buttons"><button id="mcBtn" class="full">Optimize registries (Monte Carlo)</button></div>

      <h2>Crosslinker (ABP)</h2>
      <div class="control">
        <label>Type</label>
        <select id="abpType">
          <option value="fascin">Fascin (short, rigid)</option>
          <option value="actinin">α-actinin (long, flexible heads)</option>
          <option value="camkii">CaMKII (medium, flexible middle)</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      <div class="control"><label>Crosslinker rest length L₀ (nm) <span id="clDistVal"></span></label><input id="clDist" type="range" min="5" max="45" step="0.5" value="11.0" /></div>
      <div class="control"><label>Crosslinker stiffness k<sub>cl</sub> (pN/nm) <span id="kclVal"></span></label><input id="kcl" type="range" min="0.1" max="500" step="0.1" value="120" /></div>
      <div class="control"><label>Tangent-orthogonality k<sub>⊥</sub> (pN/nm) <span id="kperpVal"></span></label><input id="kperp" type="range" min="0" max="500" step="1" value="40" /></div>

      <h2>Filament mechanics</h2>
      <div class="control"><label>Bond stiffness k<sub>b</sub> (pN/nm) <span id="kbVal"></span></label><input id="kb" type="range" min="50" max="20000" step="10" value="2000" /></div>
      <div class="control"><label>Bending κ (pN·nm, angle form) <span id="kthetaVal"></span></label><input id="ktheta" type="range" min="0" max="60000" step="100" value="15000" /></div>
      <div class="control"><label>Steric repulsion (pN/nm) <span id="repVal"></span></label><input id="rep" type="range" min="0" max="200" step="1" value="20" /></div>

      <h2>Dynamics</h2>
      <div class="control"><label>Thermal noise (k<sub>B</sub>T units) <span id="tempVal"></span></label><input id="temp" type="range" min="0" max="2" step="0.01" value="0.00" /></div>
      <div class="control"><label>Time step (arb.) <span id="dtVal"></span></label><input id="dt" type="range" min="0.0001" max="0.01" step="0.0001" value="0.0020" /></div>
      <div class="control"><label>Steps / frame <span id="stepsVal"></span></label><input id="steps" type="range" min="1" max="40" step="1" value="6" /></div>

      <h2>Perturbation</h2>
      <div class="control">
        <label>Mode</label>
        <select id="perturbMode">
          <option value="none">None (free)</option>
          <option value="bend3">3-point bend (clamp ends, push centre)</option>
        </select>
      </div>
      <div class="control"><label>Centre displacement Δ (nm) <span id="defVal"></span></label><input id="def" type="range" min="0" max="60" step="0.5" value="0" /></div>
      <div class="buttons three">
        <button id="sweepBtn">Sweep Δ → CSV</button>
        <button id="resetForcesBtn">Zero deflection</button>
        <button id="clearCsvBtn">Clear data</button>
      </div>
      <div id="sweepTable" class="sweep-table"><em>No data - click "Sweep Δ → CSV" to generate.</em></div>

      <h2>Display</h2>
      <div class="buttons three">
        <button id="faceToggle" class="toggle">Faces</button>
        <button id="registryToggle" class="toggle">Registry</button>
        <button id="ghostToggle" class="toggle on">Filaments</button>
      </div>

      <h2>Run</h2>
      <div class="buttons">
        <button id="pauseBtn">Pause</button>
        <button id="kickBtn">Kick</button>
        <button id="straightBtn" class="full">Reset straight bundle</button>
        <button id="randomBtn" class="full">Reset with transverse disorder</button>
        <button id="fitBtn" class="full">Fit view</button>
      </div>
    </aside>

    <main>
      <canvas id="canvas"></canvas>
      <div class="legend" id="legend"></div>
      <div class="readout" id="readout"></div>
      <div class="hint">Drag to rotate · Wheel zoom · Shift-drag pan · Ctrl-drag a bead to grab</div>
    </main>
  </div>
`;

export function ensureAppShell(): void {
  if (!document.getElementById("app")) {
    document.body.innerHTML = APP_HTML;
  }
}
