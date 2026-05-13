export const APP_HTML = String.raw`
  <div id="app">
    <aside>
      <h1>Actin bundle toy model</h1>
      <p>
        Bead-chain filaments on a selectable hexagonal or square lattice. Filament geometry is the toy
        scaffold — beads sit on the filament axis with bond length b. Only the
        binding-site registry is helical: each filament has a phase φ<sub>i</sub>
        and monomer m exposes a binding direction θ<sub>i</sub>(m) = φ<sub>i</sub> + m·twist.
        Crosslinks gate by angular alignment with the neighbor direction.
      </p>

      <div class="equation">
        <strong>Discrete-12:</strong> bead m of filament i exposes D[(m+s<sub>i</sub>) mod 12]; neighbor directions use the nearest active 12-state face and its opposite.<br>
        <strong>Continuous angular:</strong> θ<sub>i</sub>(m) = phaseOffset + φ<sub>i</sub> + handedness · twist · m.
        Score = soft<sup>p</sup>(|θ<sub>i</sub>(m)−α<sub>k</sub>|) · soft<sup>p</sup>(|θ<sub>j</sub>(m)−(α<sub>k</sub>+180°)|), gated by ±threshold.
        MC samples φ<sub>i</sub> continuously.
      </div>

      <h2>Bundle</h2>
      <div class="control">
        <label>Lattice</label>
        <select id="latticeGeometry">
          <option value="hex">Hexagonal</option>
          <option value="square">Square</option>
        </select>
      </div>
      <div class="control"><label>Lattice radius <span id="ringsVal"></span></label><input id="rings" type="range" min="1" max="6" step="1" value="2" /></div>
      <div class="control"><label>Monomers / filament <span id="monomersVal"></span></label><input id="monomers" type="range" min="24" max="400" step="4" value="96" /></div>
      <div class="control"><label>Lattice spacing a (nm) <span id="aVal"></span></label><input id="a" type="range" min="8" max="45" step="0.5" value="11.0" /></div>
      <div class="control"><label>Bead spacing b (nm, axial) <span id="bVal"></span></label><input id="b" type="range" min="2.0" max="3.5" step="0.05" value="2.75" /></div>

      <h2>Helicity &amp; registry</h2>
      <div class="control">
        <label>Helicity model</label>
        <select id="helicityMode">
          <option value="discrete12">Discrete 12-state</option>
          <option value="continuous">Continuous angle</option>
        </select>
      </div>
      <div class="control">
        <label>Helix handedness</label>
        <select id="helicityHandedness">
          <option value="1">Right-handed (+1)</option>
          <option value="-1">Left-handed (-1)</option>
        </select>
      </div>
      <div class="control"><label>Twist / monomer (deg) <span id="actinTwistDegVal"></span></label><input id="actinTwistDeg" type="range" min="150" max="180" step="0.05" value="166.15" /></div>
      <div class="control"><label>Phase offset (deg) <span id="helicityPhaseOffsetDegVal"></span></label><input id="helicityPhaseOffsetDeg" type="range" min="0" max="360" step="1" value="0" /></div>
      <div class="control"><label>Angular threshold (deg) <span id="helicityAngleThresholdDegVal"></span></label><input id="helicityAngleThresholdDeg" type="range" min="0" max="180" step="1" value="30" /></div>
      <div class="control"><label>Compatibility sharpness <span id="compatibilitySharpnessVal"></span></label><input id="compatibilitySharpness" type="range" min="0" max="6" step="0.05" value="1" /></div>
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
      <div class="control"><label>MC phase σ₀ (deg, continuous) <span id="mcPhaseSigma0Val"></span></label><input id="mcPhaseSigma0" type="range" min="1" max="90" step="0.5" value="30" /></div>
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
          <option value="bend3">3-point bend (angle, COM sections)</option>
        </select>
      </div>
      <div class="control"><label>ABC bend angle (deg) <span id="bendAngleDegVal"></span></label><input id="bendAngleDeg" type="range" min="0" max="180" step="1" value="180" /></div>
      <div class="control"><label>COM layers / point <span id="bendLayersVal"></span></label><input id="bendLayers" type="range" min="1" max="10" step="1" value="3" /></div>
      <div class="control"><label>Angle stiffness k<sub>ABC</sub> (pN·nm/rad²) <span id="bendKAngleLog10Val"></span></label><input id="bendKAngleLog10" type="range" min="-1" max="7" step="0.05" value="3.70" /></div>
      <div class="buttons three">
        <button id="sweepBtn">Sweep angle → CSV</button>
        <button id="resetForcesBtn">Straight angle</button>
        <button id="clearCsvBtn">Clear data</button>
      </div>
      <div id="sweepTable" class="sweep-table"><em>No data - click "Sweep angle → CSV" to generate.</em></div>

      <h2>Display</h2>
      <div class="control">
        <label>Highlight filament</label>
        <select id="highlightFilament">
          <option value="-1">None</option>
        </select>
      </div>
      <div class="buttons">
        <button id="faceToggle" class="toggle">Faces</button>
        <button id="faceArrowToggle" class="toggle">Face arrows</button>
        <button id="registryToggle" class="toggle">Registry</button>
        <button id="ghostToggle" class="toggle on">Filaments</button>
      </div>

      <h2>Run</h2>
      <div class="buttons">
        <button id="pauseBtn">Resume</button>
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
      <div class="hint">Drag to rotate · Wheel to zoom · Shift+drag to pan · Ctrl+drag to grab · Touch: drag to rotate, long-press to grab</div>
    </main>
  </div>
`;

export function ensureAppShell(): void {
  if (!document.getElementById("app")) {
    document.body.innerHTML = APP_HTML;
  }
}
