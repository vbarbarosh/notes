# Formatting

* **Directive values: parentheses around compound expressions**

    Vue directive values (`v-if`, `v-else-if`, `v-show`, `v-bind:*`, `v-on:*`, etc.) follow this rule:
    * Simple expressions stay bare — a single identifier, member access, method call, template literal, or unary negation. `v-if="ready"`, `v-bind:value="period"`, `v-on:click="click_save"`, `v-if="!ready"`, `v-bind:items="page_banners2.banners_avail"`
    * Compound expressions — anything with a binary operator (`&&`, `||`, `===`, `!==`, `<`, `>`, `+`, ...) or a ternary — must be wrapped in parentheses
    * Example:

      ```
      <!-- BAD -->
      <button v-if="ready && !busy" v-on:click="save">Save</button>
      <div v-bind:class="compact ? 'narrow' : 'wide'" />
      <span v-show="banners.length > 0">…</span>

      <!-- GOOD -->
      <button v-if="(ready && !busy)" v-on:click="save">Save</button>
      <div v-bind:class="(compact ? 'narrow' : 'wide')" />
      <span v-show="(banners.length > 0)">…</span>

      <!-- GOOD — simple expressions stay bare -->
      <button v-if="ready" v-on:click="save">Save</button>
      <div v-bind:class="container_class" />
      <loading v-if="!ready" />
      ```

* **Vue template attribute ordering**

    On a Vue element or component, attributes appear in this order, top to bottom:
    1. **`v-*` directives** — `v-if`, `v-else`, `v-else-if`, `v-for`, `v-model`, `v-show`, `v-slot`, `v-html`, `v-once`, `v-domsize`, custom directives
    2. **`v-on:*` event listeners** — handlers attached to events
    3. **`v-bind:*` value bindings** — dynamic values
    4. **Static attributes** — literal `class`, `style`, `ref`, plain HTML attributes, string-literal props
    * Example:

      ```
      <!-- BAD -->
      <input-datetimerange2 v-bind:value="period" v-on:input="input_period" class="w300" />

      <!-- GOOD -->
      <input-datetimerange2 v-on:input="input_period" v-bind:value="period" class="w300" />

      <!-- GOOD — full ordering visible -->
      <button-void v-if="ready"
                     v-on:click="click_save"
                     v-bind:disabled="busy"
                     class="button-primary"
                     type="submit">
          Save
      </button-void>
      ```
