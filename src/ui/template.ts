export const APP_HTML = String.raw`
  <div id="app">
    <header class="app-header">
      <h1>Actin bundle toy model</h1>
      <p class="subtitle">
        An interactive bundle of bead-chain actin filaments. Build the lattice,
        choose a helicity, and search for registries that maximize compatible
        crosslink sites.
      </p>
    </header>

    <section class="canvas-stage">
      <canvas id="canvas"></canvas>
      <div class="panel-frame legend-frame" id="legendFrame">
        <button class="panel-collapse" data-target="legend" aria-label="Collapse legend" title="Collapse">−</button>
        <div class="legend" id="legend"></div>
      </div>
      <div class="panel-frame readout-frame" id="readoutFrame">
        <button class="panel-collapse" data-target="readout" aria-label="Collapse readout" title="Collapse">−</button>
        <div class="readout" id="readout"></div>
      </div>
      <div class="hover-info" id="hoverInfo" hidden></div>
      <div class="hint">Drag to rotate · Wheel to zoom · Shift+drag to pan · Ctrl+drag to grab · Hover for site info · Touch: drag to rotate, long-press to grab</div>
    </section>

    <nav class="canvas-toolbar" aria-label="View and display">
      <div class="toolbar-group">
        <button id="sideViewBtn" class="tool-btn">Side</button>
        <button id="topViewBtn" class="tool-btn">Top</button>
        <button id="fitBtn" class="tool-btn">Fit</button>
      </div>
      <div class="toolbar-sep" aria-hidden="true"></div>
      <div class="toolbar-group">
        <button id="faceToggle" class="tool-btn toggle">Faces</button>
        <button id="faceArrowToggle" class="tool-btn toggle">Arrows</button>
        <button id="registryToggle" class="tool-btn toggle">Registry</button>
        <button id="ghostToggle" class="tool-btn toggle on">Filaments</button>
      </div>
      <div class="toolbar-sep" aria-hidden="true"></div>
      <div class="toolbar-group toolbar-grow">
        <label class="toolbar-label" for="highlightFilament">Highlight</label>
        <select id="highlightFilament">
          <option value="-1">None</option>
        </select>
      </div>
    </nav>

    <nav class="tabs" role="tablist" aria-label="Sections">
      <button class="tab active" data-tab="bundle" role="tab" aria-selected="true">Bundle construction</button>
      <button class="tab" data-tab="mc" role="tab" aria-selected="false">Monte Carlo</button>
      <button class="tab" data-tab="dynamics" role="tab" aria-selected="false">Dynamics <span class="tab-badge">WIP</span></button>
    </nav>

    <section class="tab-panel" data-panel="bundle" role="tabpanel">
      <p class="panel-intro">
        Build the actin bundle: choose its size and helical geometry. Helicity
        defaults to continuous left-handed actin (twist ≈ 166.15°/monomer).
      </p>

      <div class="control"><label>Lattice radius <span id="ringsVal"></span></label><input id="rings" type="range" min="1" max="6" step="1" value="2" /></div>
      <div class="control"><label>Monomers / filament <span id="monomersVal"></span></label><input id="monomers" type="range" min="24" max="400" step="4" value="96" /></div>
      <div class="control"><label>Twist / monomer (deg) <span id="actinTwistDegVal"></span></label><input id="actinTwistDeg" type="range" min="150" max="180" step="0.05" value="166.15" /></div>

      <details class="advanced">
        <summary>Show advanced</summary>

        <h3 class="sub-heading">Lattice geometry</h3>
        <div class="control">
          <label>Lattice</label>
          <select id="latticeGeometry">
            <option value="hex" selected>Hexagonal</option>
            <option value="square">Square</option>
          </select>
        </div>
        <div class="control"><label>Lattice spacing a (nm) <span id="aVal"></span></label><input id="a" type="range" min="8" max="45" step="0.5" value="11.0" /></div>
        <div class="control"><label>Bead spacing b (nm, axial) <span id="bVal"></span></label><input id="b" type="range" min="2.0" max="3.5" step="0.05" value="2.75" /></div>

        <h3 class="sub-heading">Helicity &amp; registry</h3>
        <div class="control">
          <label>Helicity model</label>
          <select id="helicityMode">
            <option value="discrete12">Discrete 12-state</option>
            <option value="continuous" selected>Continuous angle</option>
          </select>
        </div>
        <div class="control">
          <label>Helix handedness</label>
          <select id="helicityHandedness">
            <option value="1">Right-handed (+1)</option>
            <option value="-1" selected>Left-handed (-1)</option>
          </select>
        </div>
        <div class="control"><label>Phase offset (deg) <span id="helicityPhaseOffsetDegVal"></span></label><input id="helicityPhaseOffsetDeg" type="range" min="0" max="360" step="1" value="0" /></div>
        <div class="control"><label>Angular threshold (deg) <span id="helicityAngleThresholdDegVal"></span></label><input id="helicityAngleThresholdDeg" type="range" min="0" max="180" step="1" value="30" /></div>
        <div class="control"><label>Compatibility sharpness <span id="compatibilitySharpnessVal"></span></label><input id="compatibilitySharpness" type="range" min="0" max="6" step="0.05" value="1" /></div>
        <div class="control">
          <label>Registry mode</label>
          <select id="registryMode">
            <option value="perfect" selected>Perfect (s = q + 2r)</option>
            <option value="zero">All zero (s = 0)</option>
            <option value="random">Random</option>
            <option value="custom">Custom (after MC)</option>
          </select>
        </div>
        <div class="control"><label>Saturation (per compatible site) <span id="satVal"></span></label><input id="sat" type="range" min="0" max="1" step="0.01" value="1.00" /></div>

        <h3 class="sub-heading">Crosslinker (ABP)</h3>
        <div class="control">
          <label>Type</label>
          <select id="abpType">
            <option value="fascin" selected>Fascin (short, rigid)</option>
            <option value="actinin">α-actinin (long, flexible heads)</option>
            <option value="camkii">CaMKII (medium, flexible middle)</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div class="control"><label>Crosslinker rest length L₀ (nm) <span id="clDistVal"></span></label><input id="clDist" type="range" min="5" max="45" step="0.5" value="11.0" /></div>
        <div class="control"><label>Crosslinker stiffness k<sub>cl</sub> (pN/nm) <span id="kclVal"></span></label><input id="kcl" type="range" min="0.1" max="500" step="0.1" value="120" /></div>
        <div class="control"><label>Tangent-orthogonality k<sub>⊥</sub> (pN/nm) <span id="kperpVal"></span></label><input id="kperp" type="range" min="0" max="500" step="1" value="40" /></div>

        <div class="buttons"><button id="rebuildBtn" class="full">Rebuild crosslinks (re-roll saturation)</button></div>
      </details>
    </section>

    <section class="tab-panel" data-panel="mc" role="tabpanel" hidden>
      <p class="panel-intro">
        Search for a registry assignment that maximizes compatible crosslink
        sites. The graph plots the current and best connection counts versus
        Monte Carlo temperature.
      </p>

      <div class="buttons"><button id="mcBtn" class="full">Optimize registries (Monte Carlo)</button></div>
      <div id="mcGraph" class="mc-graph"></div>

      <details class="advanced">
        <summary>Show advanced</summary>
        <div class="control"><label>MC starting T₀ <span id="mcT0Val"></span></label><input id="mcT0" type="range" min="0.05" max="40" step="0.05" value="8" /></div>
        <div class="control"><label>MC ending T₁ <span id="mcT1Val"></span></label><input id="mcT1" type="range" min="0.001" max="4" step="0.001" value="0.05" /></div>
        <div class="control"><label>MC iterations <span id="mcItersVal"></span></label><input id="mcIters" type="range" min="500" max="40000" step="500" value="4000" /></div>
        <div class="control"><label>MC skew penalty <span id="mcSkewVal"></span></label><input id="mcSkew" type="range" min="0" max="1" step="0.01" value="0.15" /></div>
        <div class="control"><label>MC phase σ₀ (deg, continuous) <span id="mcPhaseSigma0Val"></span></label><input id="mcPhaseSigma0" type="range" min="1" max="90" step="0.5" value="30" /></div>
      </details>
    </section>

    <section class="tab-panel" data-panel="dynamics" role="tabpanel" hidden>
      <p class="panel-intro panel-intro-wip">
        <strong>Work in progress.</strong> Dynamics, mechanics, and bending
        experiments. The numerical results here are not yet calibrated and the
        controls may change.
      </p>

      <h3 class="sub-heading">Filament mechanics</h3>
      <div class="control"><label>Bond stiffness k<sub>b</sub> (pN/nm) <span id="kbVal"></span></label><input id="kb" type="range" min="50" max="20000" step="10" value="2000" /></div>
      <div class="control"><label>Bending κ (pN·nm, angle form) <span id="kthetaVal"></span></label><input id="ktheta" type="range" min="0" max="60000" step="100" value="15000" /></div>
      <div class="control"><label>Steric repulsion (pN/nm) <span id="repVal"></span></label><input id="rep" type="range" min="0" max="200" step="1" value="20" /></div>

      <h3 class="sub-heading">Time integration</h3>
      <div class="control"><label>Thermal noise (k<sub>B</sub>T units) <span id="tempVal"></span></label><input id="temp" type="range" min="0" max="2" step="0.01" value="0.00" /></div>
      <div class="control"><label>Time step (arb.) <span id="dtVal"></span></label><input id="dt" type="range" min="0.0001" max="0.01" step="0.0001" value="0.0020" /></div>
      <div class="control"><label>Steps / frame <span id="stepsVal"></span></label><input id="steps" type="range" min="1" max="40" step="1" value="6" /></div>

      <h3 class="sub-heading">Run</h3>
      <div class="buttons">
        <button id="pauseBtn">Resume</button>
        <button id="kickBtn">Kick</button>
        <button id="straightBtn" class="full">Reset straight bundle</button>
        <button id="randomBtn" class="full">Reset with transverse disorder</button>
      </div>

      <h3 class="sub-heading">Perturbation (3-point bend)</h3>
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
    </section>
  </div>
`;

export function ensureAppShell(): void {
  if (!document.getElementById("app")) {
    document.body.innerHTML = APP_HTML;
  }
}
