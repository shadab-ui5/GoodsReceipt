sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageBox",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/FilterType",
    "sap/ui/core/UIComponent"
], function (Controller, MessageBox, JSONModel, Fragment, Filter, FilterOperator, FilterType, UIComponent) {
    "use strict";

    return Controller.extend("hodek.grnscan.controller.View1", {
        onInit: function () {
            this.getOwnerComponent().setModel(new sap.ui.model.json.JSONModel(), "ObjectModel");
            this._model = this.getOwnerComponent().getModel("ObjectModel");
            this.JSR = UIComponent.getRouterFor(this);
            UIComponent.getRouterFor(this).getRoute('RouteView1').attachPatternMatched(this.ScreenRefresh, this);
        },

        ScreenRefresh: function () {
            this.getView().byId("idGRN").setValue();
            this.getView().byId("idButtonGo").setText("Go");
            this.getView().byId("idButtonGo").setBusy(false);

        },
        handleGenerate: function () {
            let oButton=this.getView().byId("idButtonGo");
            var GRN = this.getView().byId("idGRN").getValue();
            if (GRN === "") {
                MessageBox.error("Please Enter ASN No.")
            }
            if (GRN.length === 10) {
                this.getView().byId("idButtonGo").setText("Loading..");
                oButton.setBusy(true);
                this.JSR.navTo("Routesecond",{
                    asn:GRN
                });
            }
        },
        
    });
});