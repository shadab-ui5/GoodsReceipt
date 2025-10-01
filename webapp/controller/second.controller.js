sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/BusyDialog",
    "sap/ui/core/UIComponent",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/model/Sorter",
    "sap/ui/core/syncStyleClass",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/core/Fragment",
    "sap/ndc/BarcodeScanner",
    "sap/ui/comp/valuehelpdialog/ValueHelpDialog",
    "sap/ui/comp/filterbar/FilterBar",
    "sap/ui/comp/filterbar/FilterItem",
], function (Controller, BusyDialog, UIComponent, MessageBox, MessageToast, Sorter, syncStyleClass, JSONModel, Filter, FilterOperator, Fragment, BarcodeScanner, ValueHelpDialog, FilterBar, FilterItem) {
    "use strict";

    return Controller.extend("hodek.grnscan.controller.second", {
        formatter: {
            isBatchEditable: function (sPlantValue) {
                return sPlantValue === "1400";
            }
        },

        onInit: function () {
            var today = new Date();
            this.bQuantityFine = true;
            var dateFormat = sap.ui.core.format.DateFormat.getDateInstance({ pattern: "dd-MM-yyyy" });
            var formattedDate = dateFormat.format(today);
            this.getView().byId("PostingDate").setText(formattedDate);
            this.getView().setModel(new sap.ui.model.json.JSONModel(), "oDataModel");
            this.getView().getModel('oDataModel').setProperty("/aTableData", []);
            UIComponent.getRouterFor(this).getRoute('Routesecond').attachPatternMatched(this.CallScreenData, this);
            // UIComponent.getRouterFor(this).getRoute('second').attachPatternMatched(this.ScreenRefreshFunction, this);

        },
        onNavBack: function () {
            var oHistory = sap.ui.core.routing.History.getInstance();
            var sPreviousHash = oHistory.getPreviousHash();

            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                this.getOwnerComponent().getRouter().navTo("RouteView1", {}, true); // replace with actual route
            }
        },
        extractValue: function (str) {
            // Match content inside brackets
            let match = str.match(/\((.*?)\)/);
            if (match) {
                // Remove leading zeros
                return match[1].replace(/^0+/, '');
            }
            return null;
        },
        onAfterRendering1: function () {
            var oTableModel = this.getView().getModel("oTableDataModel2");

            if (oTableModel) {
                var aTableData = oTableModel.getProperty("/aTableData2");

                if (aTableData) {
                    aTableData.forEach(function (row) {
                        row.isBatchEditable = (row.Plant === "1400");
                    });

                    oTableModel.setProperty("/aTableData2", aTableData);
                } else {
                    console.warn("No data found at /aTableData2");
                }
            } else {
                console.error("oTableDataModel2 is undefined.");
            }
        },
        // 🚀 Cancel Button (id=cancelGrn) Pressed
        onCancelPress: function () {
            const oBusyDialog = this._createBusyDialog();
            oBusyDialog.open();

            try {
                const asn = this._getAsnFromObjectModel();
                this._handleCancelWorkflow(asn, oBusyDialog);
            } catch (errorMessage) {
                oBusyDialog.close();
                sap.m.MessageToast.show(errorMessage);
            }
        },

        CallScreenData: function (oEvent) {
            let currentAsn = oEvent.getParameter("arguments").asn;
            const oComponent = this.getOwnerComponent();
            const ObjectModel = oComponent.getModel("ObjectModel");
            if (!ObjectModel) {
                this.onNavBack();
            }
            var obj = {
                "asn": currentAsn,
            }
            ObjectModel.setProperty("/object", obj);
            ObjectModel.setProperty("/savebtn", true);
            const oBusyDialog = this._createBusyDialog();
            oBusyDialog.open();

            // clear table data before loading
            this.getView().getModel("oDataModel").setProperty("/aTableData", []);

            try {
                const asn = this._getAsnFromObjectModel();
                this._handleNormalWorkflow(asn, oBusyDialog);
            } catch (errorMessage) {
                oBusyDialog.close();
                sap.m.MessageToast.show(errorMessage);
            }
        },

        /**
         * Utility: Creates a standard busy dialog
         */
        _createBusyDialog: function () {
            return new sap.m.BusyDialog({
                title: "Loading",
                text: "Please wait..."
            });
        },

        /**
         * Utility: Fetch ASN from ObjectModel safely
         * Throws an error message if missing
         */
        _getAsnFromObjectModel: function () {
            const oComponent = this.getOwnerComponent();
            const ObjectModel = oComponent.getModel("ObjectModel");

            if (!ObjectModel) {
                throw "System error: Object model missing.";
            }

            const asn = ObjectModel.getProperty("/object/asn");
            if (!asn) {
                throw "ASN is missing!";
            }

            return asn;
        },

        setTableEditable: function (bEditable) {
            var oTable = this.byId("FirstTable");
            oTable.getItems().forEach(function (oItem) {
                oItem.getCells().forEach(function (oCell) {
                    if (oCell.setEditable) {
                        oCell.setEditable(bEditable);
                    }
                });
            });
        },
        /**
         * Cancel workflow (when delete/cancel is triggered)
         */
        _handleCancelWorkflow: function (asn, oBusyDialog) {
            var that = this;
            var aFilters = [new sap.ui.model.Filter("asn", sap.ui.model.FilterOperator.EQ, asn)];
            var cancelHeaderModel = new sap.ui.model.odata.v2.ODataModel("/sap/opu/odata/sap/ZGRN_SERV");

            cancelHeaderModel.read("/Header", {
                filters: aFilters,
                success: function (oResponse) {
                    if (oResponse.results.length === 0) {
                        oBusyDialog.close();
                        sap.m.MessageToast.show("No data found for the given ASN.");
                        return;
                    }

                    var oData = oResponse.results[0];
                    var materialDocNo = oData.Materialdocno;
                    var postingDate = that.getView().byId("PostingDate").getText();
                    var MaterialDocumentYear = oData.Fiscalyear;
                    var GateEntryNo = oData.asn;

                    if (!materialDocNo) {
                        oBusyDialog.close();
                        sap.m.MessageToast.show("No GRN found to cancel.");
                        return;
                    }

                    var dateParts = postingDate.split("-");
                    if (dateParts.length !== 3) {
                        oBusyDialog.close();
                        MessageBox.error("Invalid posting date value.");
                        return;
                    }

                    var formattedPostingDate = dateParts[2] + "-" + dateParts[1] + "-" + dateParts[0]; // YYYY-MM-DD
                    var dateObj = new Date(formattedPostingDate);

                    if (isNaN(dateObj.getTime())) {
                        oBusyDialog.close();
                        MessageBox.error("Invalid posting date value.");
                        return;
                    }

                    var isoFormattedDate = dateObj.toISOString();
                    var formattedDateForRequest = isoFormattedDate.substring(0, 19);

                    $.ajax({
                        type: "GET",
                        url: "/sap/opu/odata/sap/API_MATERIAL_DOCUMENT_SRV/",
                        beforeSend: function (xhr) {
                            xhr.setRequestHeader("X-CSRF-Token", "Fetch");
                        },
                        success: function (data, textStatus, jqXHR) {
                            var token = jqXHR.getResponseHeader("X-CSRF-Token");
                            $.ajax({
                                type: "POST",
                                url: "/sap/opu/odata/sap/API_MATERIAL_DOCUMENT_SRV/Cancel?" +
                                    "MaterialDocumentYear='" + MaterialDocumentYear + "'" +
                                    "&MaterialDocument='" + materialDocNo + "'" +
                                    "&PostingDate=datetime'" + formattedDateForRequest + "'",
                                headers: {
                                    "X-CSRF-TOKEN": token,
                                    "Accept": "application/json",
                                    "Authorization": "Basic UFAwMTpOREdrbGRXVm5oc3l5bFZUekF6WUdNdXJvcHlOVEUtYXhUNmNBUHFn"
                                },
                                data: JSON.stringify({
                                    "MaterialDocument": materialDocNo,
                                    "PostingDate": postingDate + "T00:00:00",
                                    "DocumentYear": MaterialDocumentYear
                                }),
                                contentType: "application/json; charset=utf-8",
                                success: function (data) {
                                    var matdoc = data.d.MaterialDocument;
                                    oBusyDialog.close();
                                    MessageBox.success("GRN Cancelled successfully with Material document: " + matdoc, {
                                        onClose: function (oAction) {
                                            if (oAction === MessageBox.Action.OK || oAction === MessageBox.Action.CLOSE || oAction === null) {
                                                var oPayload = {
                                                    headerData: {
                                                        matdoc,
                                                        GateEntryNo,
                                                        postingDate,
                                                        MaterialDocumentYear,
                                                        "Type": "GRNCancel"
                                                    }
                                                };

                                                $.ajax({
                                                    type: "POST",
                                                    url: "/sap/bc/http/sap/ZMM_GRN_HTTP?&Type=GRNCancel",
                                                    contentType: "application/json",
                                                    data: JSON.stringify(oPayload),
                                                    success: function () {
                                                        console.log("MaterialDocument sent to HTTP service successfully.");
                                                    },
                                                    error: function (xhr, status, error) {
                                                        console.error("Error sending MaterialDocument to HTTP service: ", error);
                                                    }
                                                });

                                                window.history.go(-1);
                                            }
                                        }
                                    });
                                },
                                error: function (error) {
                                    oBusyDialog.close();
                                    var message = error.responseJSON?.error?.message?.value || "Cancellation failed";
                                    MessageBox.error(message);
                                }
                            });
                        },
                        error: function () {
                            oBusyDialog.close();
                            MessageBox.error("Failed to fetch CSRF token.");
                        }
                    });
                },
                error: function () {
                    oBusyDialog.close();
                    MessageBox.error("Failed to fetch Header data.");
                }
            });
        },

        /**
         * Normal workflow (when CheckBoxCancel is NOT checked)
         */
        _handleNormalWorkflow: function (asn, oBusyDialog) {
            var that = this;
            var oModel = new sap.ui.model.odata.v2.ODataModel("/sap/opu/odata/sap/ZGRN_SERV");
            var aFilters = [new sap.ui.model.Filter("asn", sap.ui.model.FilterOperator.EQ, asn)];
            var aFilters1 = [new sap.ui.model.Filter("GateEntryId", sap.ui.model.FilterOperator.EQ, asn)];
            const oComponent = this.getOwnerComponent();
            const objectModel = oComponent.getModel("ObjectModel");
            oModel.read("/Header", {
                filters: aFilters,
                success: function (oResponse) {
                    if (oResponse.results.length === 0) {
                        sap.m.MessageToast.show("No data found for the given ASN.");
                        oBusyDialog.close();
                        window.history.go(-1);
                        return;
                    }

                    var oData = oResponse.results[0];

                    if (oData.Status === "01") {
                        MessageBox.error("Gate Entry not completed", { duration: 2200 });
                        oBusyDialog.close();
                        setTimeout(() => window.history.go(-1), 2200);
                        return;
                    }

                    if (oData.Materialdocno) {
                        objectModel.setProperty('/savebtn', false);

                    } else {
                        objectModel.setProperty('/savebtn', true);
                    }

                    // Populate header fields
                    var goodsreceipt = oData.Inwardtype;
                    var fetchPO = oData.Ponumber;
                    var GRGoodReceipt = (goodsreceipt === "RECPO") ? "101" : (goodsreceipt === "RECASIS") ? "542" : "";

                    that.getView().byId("TypeOfPosting").setText(goodsreceipt === "RECPO" ? "GOODS RECEIPT" : "TRANSFER POSTING");
                    that.getView().byId("PONumber").setText(goodsreceipt === "RECASIS" ? '' : (oData.Ponumber || ""));
                    that.getView().byId("DelChallNo").setText(goodsreceipt === "RECASIS" ? oData.Ponumber : "");
                    that.getView().byId("GateEntryID").setText(oData.asn);
                    that.getView().byId("Plant").setText(`${oData.PlantName}(${oData.Plant})`);
                    that.getView().byId("InwardType").setText(goodsreceipt);
                    that.getView().byId("InvoiceDate").setText(that._formatDate(oData.InvoiceDate));
                    that.getView().byId("LRDate").setText(that._formatDate(oData.Lrdate));
                    that.getView().byId("invoiceNo").setText(oData.InvoiceNo);
                    that.getView().byId("LRNumber").setText(oData.Lrnumber);
                    that.getView().byId("EwayBillNo").setText(oData.Ewayno);
                    that.getView().byId("VehicleNo").setText(oData.Vehicleno);
                    that.getView().byId("Transporter").setText(oData.Transporter);
                    that.getView().byId("Supplier").setText(`${oData.VendorName}(${oData.Vendor})`);
                    that.getView().byId("SupplierName").setText(oData.VendorName);
                    that.getView().byId("GRGoodReceipt").setText(GRGoodReceipt);
                    that.getView().byId("Materialdocno").setText(oData.Materialdocno);

                    // Fetch Line Items
                    that._fetchLineItems(oModel, aFilters1, goodsreceipt, fetchPO, oBusyDialog);
                },
                error: function () {
                    oBusyDialog.close();
                    sap.m.MessageToast.show("Error fetching data.");
                }
            });
        },

        /**
         * Fetch line items and subcomponents (normal flow only)
         */
        _fetchLineItems: function (oModel, aFilters1, goodsreceipt, fetchPO, oBusyDialog) {
            var that = this;
            oModel.read("/Lineitem", {
                filters: aFilters1,
                success: function (oRespo1) {
                    if (oRespo1.length === 0) {
                        oBusyDialog.close();
                        MessageBox.error('No Data Found');
                        return;
                    }

                    const aTableData = [];
                    oRespo1.results.forEach(function (item) {
                        if (item.Material && item.Material.substring(0, 10) !== "0000000000") {
                            item.Material = "0000000000" + item.Material;
                        }
                        aTableData.push({
                            GateEntryID: item.GateEntryId,
                            PONumber: goodsreceipt === "RECASIS" ? '' : item.Ponumber,
                            ItemNo: goodsreceipt === "RECASIS" ? '' : item.Itemno,
                            Material: item.Material,
                            MaterialDesc: item.Materialdesc,
                            UOM: item.BaseUnit,
                            Plant: item.Plant,
                            MovementType: goodsreceipt === 'RECASIS' ? '542' : '101',
                            PostedQuantity: item.Postedquantity + " " + item.BaseUnit,
                            StorageLocation: item.StorageLocation,
                            Quantity: item.Quantity,
                            Entered: item.Postedquantity,
                            ItemCategory: item.PurchaseOrderItemCategory,
                            Batch: '',
                            BatchQty: '',
                        });
                    });

                    that._fetchSubcomponents(oModel, aTableData, goodsreceipt, fetchPO, oBusyDialog);
                },
                error: function (oError) {
                    oBusyDialog.close();
                    console.error("OData Fetch Error:", oError);
                    sap.m.MessageToast.show("Error fetching data.");
                }
            });
        },

        /**
         * Fetch subcomponents or consumption items (normal flow only)
         */
        // _fetchSubcomponents: function (oModel, aTableData, goodsreceipt, purchaseNum, oBusyDialog) {
        //     var that = this;
        //     var path = purchaseNum.startsWith("55") ? "/subcomponent" : "/Consumption_Item";
        //     var aSecondFilters = [];

        //     if (purchaseNum.startsWith("55")) {
        //         aSecondFilters = aTableData.map(function (row) {
        //             return new sap.ui.model.Filter({
        //                 filters: [
        //                     new sap.ui.model.Filter("Ponumber", "EQ", row.PONumber),
        //                     new sap.ui.model.Filter("GateEntryId", "EQ", row.GateEntryID)
        //                 ],
        //                 and: true
        //             });
        //         });
        //     } else {
        //         aTableData.forEach(function (row) {
        //             aSecondFilters.push(new sap.ui.model.Filter("PurchaseOrder", "EQ", row.PONumber));
        //             aSecondFilters.push(new sap.ui.model.Filter("PurchaseOrderItem", "EQ", row.ItemNo));
        //             aSecondFilters.push(new sap.ui.model.Filter("GateEntryId", "EQ", row.GateEntryID));
        //         });
        //     }

        //     oModel.read(path, {
        //         filters: aSecondFilters,
        //         urlParameters: { "$top": "5000" },
        //         success: function (oRespo2) {
        //             oBusyDialog.close();

        //             if (oRespo2.results.length > 0) {
        //                 const aTableData2 = [];
        //                 oRespo2.results.forEach(function (item) {
        //                     aTableData2.push({
        //                         GateEntryID: item.GateEntryId || '',
        //                         PONumber: goodsreceipt === "RECASIS" ? '' : (item.Ponumber || item.PurchaseOrder || ''),
        //                         ItemNo: goodsreceipt === "RECASIS" ? '' : (item.Itemno || item.PurchaseOrderItem || ''),
        //                         Material: item.BillOfMaterialComponent ?
        //                             (item.BillOfMaterialComponent.substring(0, 10) !== "0000000000" ? '0000000000' + item.BillOfMaterialComponent : item.BillOfMaterialComponent)
        //                             : (item.Material && item.Material.substring(0, 10) !== "0000000000" ? '0000000000' + item.Material : item.Material) || '',
        //                         MaterialDesc: item.ProductDescription || '',
        //                         UOM: item.BaseUnit || '',
        //                         Plant: that.getView().byId("Plant").getText(),
        //                         MovementType: '543',
        //                         PostedQuantity: item.RequiredQuantity || '',
        //                         Entered: item.RequiredQuantity || '',
        //                         StorageLocation: item.StorageLocation || '',
        //                         Quantity: item.RequiredQuantity || '',
        //                         ItemCategory: '',
        //                         Batch: item.Batch || '',
        //                         BatchQty: '',
        //                     });
        //                 });

        //                 // Merge table data
        //                 const aTableData3 = [];
        //                 aTableData.forEach(function (item1) {
        //                     aTableData3.push(item1);
        //                     aTableData2.forEach(function (item2) {
        //                         if (item2.PONumber == item1.PONumber && item2.ItemNo == item1.ItemNo) {
        //                             aTableData3.push(item2);
        //                         }
        //                     });
        //                 });

        //                 that.getView().getModel('oDataModel').setProperty("/aTableData", aTableData3);
        //             } else {
        //                 that.getView().getModel('oDataModel').setProperty("/aTableData", aTableData);
        //                 if (path != '/subcomponent' && !purchaseNum.startsWith("45") && goodsreceipt != 'RECASIS') {
        //                     sap.m.MessageToast.show("No matching subcomponent items found.");
        //                 }
        //             }
        //         },
        //         error: function () {
        //             oBusyDialog.close();
        //         }
        //     });
        // },

        /**
         * Fetch subcomponents or consumption items (normal flow only)
         * and restructure data hierarchically for TreeTable
         */
        // _fetchSubcomponents: function (oModel, aTableData, goodsreceipt, purchaseNum, oBusyDialog) {
        //     var that = this;
        //     var path = purchaseNum.startsWith("55") ? "/subcomponent" : "/Consumption_Item";
        //     var aSecondFilters = [];

        //     if (purchaseNum.startsWith("55")) {
        //         aSecondFilters = aTableData.map(function (row) {
        //             return new sap.ui.model.Filter({
        //                 filters: [
        //                     new sap.ui.model.Filter("Ponumber", "EQ", row.PONumber),
        //                     new sap.ui.model.Filter("GateEntryId", "EQ", row.GateEntryID)
        //                 ],
        //                 and: true
        //             });
        //         });
        //     } else {
        //         aTableData.forEach(function (row) {
        //             aSecondFilters.push(new sap.ui.model.Filter("PurchaseOrder", "EQ", row.PONumber));
        //             aSecondFilters.push(new sap.ui.model.Filter("PurchaseOrderItem", "EQ", row.ItemNo));
        //             aSecondFilters.push(new sap.ui.model.Filter("GateEntryId", "EQ", row.GateEntryID));
        //         });
        //     }

        //     oModel.read(path, {
        //         filters: aSecondFilters,
        //         urlParameters: { "$top": "5000" },
        //         success: function (oRespo2) {
        //             oBusyDialog.close();

        //             // Build hierarchical structure
        //             const aHierarchicalData = aTableData.map(function (parent) {
        //                 const children = oRespo2.results
        //                     .filter(function (item) {
        //                         const po = item.Ponumber || item.PurchaseOrder;
        //                         const poItem = item.Itemno || item.PurchaseOrderItem;
        //                         return (
        //                             parent.PONumber === po &&
        //                             parent.ItemNo === poItem &&
        //                             parent.GateEntryID === item.GateEntryId
        //                         );
        //                     })
        //                     .map(function (item) {
        //                         return {
        //                             GateEntryID: item.GateEntryId || '',
        //                             PONumber: goodsreceipt === "RECASIS" ? '' : (item.Ponumber || item.PurchaseOrder || ''),
        //                             ItemNo: goodsreceipt === "RECASIS" ? '' : (item.Itemno || item.PurchaseOrderItem || ''),
        //                             Material: item.BillOfMaterialComponent
        //                                 ? (item.BillOfMaterialComponent.substring(0, 10) !== "0000000000"
        //                                     ? '0000000000' + item.BillOfMaterialComponent
        //                                     : item.BillOfMaterialComponent)
        //                                 : (item.Material && item.Material.substring(0, 10) !== "0000000000"
        //                                     ? '0000000000' + item.Material
        //                                     : item.Material) || '',
        //                             MaterialDesc: item.ProductDescription || '',
        //                             UOM: item.BaseUnit || '',
        //                             Plant: that.getView().byId("Plant").getText(),
        //                             MovementType: '543',
        //                             PostedQuantity: item.RequiredQuantity || '',
        //                             Entered: item.RequiredQuantity || '',
        //                             StorageLocation: item.StorageLocation || '',
        //                             Quantity: item.RequiredQuantity || '',
        //                             ItemCategory: '',
        //                             Batch: item.Batch || '',
        //                             BatchQty: '',
        //                             children: [] // keep for deeper nesting if needed
        //                         };
        //                     });

        //                 return { ...parent, children };
        //             });

        //             // Bind hierarchical data
        //             that.getView().getModel('oDataModel').setProperty("/aTableData", aHierarchicalData);

        //             // If no subcomponents found
        //             if (oRespo2.results.length === 0 && path !== '/subcomponent' && !purchaseNum.startsWith("45") && goodsreceipt !== 'RECASIS') {
        //                 sap.m.MessageToast.show("No matching subcomponent items found.");
        //             }
        //         },
        //         error: function () {
        //             oBusyDialog.close();
        //         }
        //     });
        // },

        _fetchSubcomponents: function (oModel, aTableData, goodsreceipt, purchaseNum, oBusyDialog) {
            var that = this;

            // Check if the purchaseNum starts with "55"
            if (purchaseNum.startsWith("55")) {
                // Perform AJAX call for API_SCHED_AGRMT_PROCESS_SRV
                //https://my424380-api.s4hana.cloud.sap/sap/opu/odata/sap/API_SCHED_AGRMT_PROCESS_SRV/A_SchAgrmtSchLine(SchedulingAgreement=%275500000023%27,SchedulingAgreementItem=%2710%27,ScheduleLine=%271%27)/to_SchedgAgrmtSubcontrgCompTP


                var url = "/sap/bc/http/sap/ZGRN_SUBCOMPONENT_API";
                var ajaxCalls = aTableData.map(function (row) {
                    var oPayload = {
                        SchedulingAgreement: row.PONumber,
                        SchedulingAgreementItem: row.ItemNo,
                        ScheduleLine: "1"
                    };
                    return $.ajax({
                        url: url,
                        type: 'POST',
                        data: JSON.stringify(oPayload),
                        dataType: 'json',
                        headers: {
                            "Accept": "application/json",
                        }
                    });
                });

                // Wait for all AJAX calls to complete
                $.when.apply($, ajaxCalls).done(function () {
                    oBusyDialog.close();

                    // Flatten results from multiple calls
                    var resultsArray = Array.prototype.slice.call(arguments).map(function (arg) {
                        // Depending on single or multiple AJAX calls, the response structure differs
                        return arg || [];
                    }).flat();

                    // Build hierarchical structure
                    const aHierarchicalData = aTableData.map(function (parent) {
                        const children = resultsArray
                            .filter(function (item) {
                                return parent.PONumber === item.SCHEDULINGAGREEMENT &&
                                    parent.ItemNo === item.SCHEDULINGAGREEMENTITEM;
                            })
                            .map(function (item) {
                                return {
                                    IsChild: true, // 👈 mark as child
                                    GateEntryID: parent.GateEntryID,
                                    PONumber: goodsreceipt === "RECASIS" ? '' : parent.PONumber,
                                    ItemNo: goodsreceipt === "RECASIS" ? '' : parent.ItemNo,
                                    Material: item.MATERIAL || '',
                                    MaterialDesc: item.MATERIAL || '',
                                    UOM: item.ENTRYUNIT || '',
                                    Plant: that.getView().byId("Plant").getText(),
                                    MovementType: '543',
                                    PostedQuantity: '',
                                    Entered: Number(((item.QUANTITYINENTRYUNIT / parent.Quantity) * parent.Entered).toFixed(2)) || '',
                                    StorageLocation: '',
                                    Quantity: item.QUANTITYINENTRYUNIT || '',
                                    ItemCategory: '',
                                    Batch: item.Batch || '',
                                    BatchQty: '',
                                    children: []
                                };
                            });

                        return {
                            ...parent,
                            IsChild: false, // 👈 mark as parent
                            children
                        };
                    });


                    that.getView().getModel('oDataModel').setProperty("/aTableData", aHierarchicalData);

                    if (resultsArray.length === 0 && goodsreceipt !== 'RECASIS') {
                        sap.m.MessageToast.show("No matching subcomponent items found.");
                    }

                }).fail(function () {
                    oBusyDialog.close();
                    sap.m.MessageToast.show("Failed to fetch subcomponent data.");
                });

            } else {
                // Default logic for /Consumption_Item
                var path = "/Consumption_Item";
                var aSecondFilters = [];

                aTableData.forEach(function (row) {
                    aSecondFilters.push(new sap.ui.model.Filter("PurchaseOrder", "EQ", row.PONumber));
                    aSecondFilters.push(new sap.ui.model.Filter("PurchaseOrderItem", "EQ", row.ItemNo));
                    aSecondFilters.push(new sap.ui.model.Filter("GateEntryId", "EQ", row.GateEntryID));
                });

                oModel.read(path, {
                    filters: aSecondFilters,
                    urlParameters: { "$top": "5000" },
                    success: function (oRespo2) {
                        oBusyDialog.close();

                        const aHierarchicalData = aTableData.map(function (parent) {
                            const children = oRespo2.results
                                .filter(function (item) {
                                    return parent.PONumber === item.PurchaseOrder &&
                                        parent.ItemNo === item.PurchaseOrderItem &&
                                        parent.GateEntryID === item.GateEntryId;
                                })
                                .map(function (item) {
                                    return {
                                        GateEntryID: item.GateEntryId || '',
                                        PONumber: goodsreceipt === "RECASIS" ? '' : item.PurchaseOrder || '',
                                        ItemNo: goodsreceipt === "RECASIS" ? '' : item.PurchaseOrderItem || '',
                                        Material: item.Material || '',
                                        MaterialDesc: item.ProductDescription || '',
                                        UOM: item.BaseUnit || '',
                                        Plant: that.getView().byId("Plant").getText(),
                                        MovementType: '543',
                                        PostedQuantity: item.RequiredQuantity || '',
                                        Entered: item.RequiredQuantity || '',
                                        StorageLocation: item.StorageLocation || '',
                                        Quantity: item.RequiredQuantity || '',
                                        ItemCategory: '',
                                        Batch: item.Batch || '',
                                        BatchQty: '',
                                        children: []
                                    };
                                });
                            return { ...parent, children };
                        });

                        that.getView().getModel('oDataModel').setProperty("/aTableData", aHierarchicalData);

                        if (oRespo2.results.length === 0 && goodsreceipt !== 'RECASIS') {
                            sap.m.MessageToast.show("No matching subcomponent items found.");
                        }
                    },
                    error: function () {
                        oBusyDialog.close();
                    }
                });
            }
        },

        ScreenRefreshFunction: function () {
            var that = this;
            var oBusyDialog = new sap.m.BusyDialog({
                title: "Loading",
                text: "Please wait..."
            });
            oBusyDialog.open();

            var oModel = new sap.ui.model.odata.v2.ODataModel("/sap/opu/odata/sap/ZGRN_SERV");
            var oComponent = this.getOwnerComponent();
            var ObjectModel = oComponent.getModel("ObjectModel");

            if (!ObjectModel) {
                oBusyDialog.close();
                sap.m.MessageToast.show("System error: Object model missing.");
                return;
            }

            var asn = ObjectModel.getProperty("/object/asn");
            var CheckBoxCancel = ObjectModel.getProperty("/object/CheckBoxCancel");

            if (!asn) {
                oBusyDialog.close();
                sap.m.MessageToast.show("ASN is missing!");
                return;
            }
            var aFilters = [new sap.ui.model.Filter("asn", sap.ui.model.FilterOperator.EQ, asn)];
            if (CheckBoxCancel === true) {
                var cancelHeaderModel = new sap.ui.model.odata.v2.ODataModel("/sap/opu/odata/sap/ZGRN_SERV");
                cancelHeaderModel.read("/Header", {
                    filters: aFilters,
                    success: function (oResponse) {
                        if (oResponse.results.length === 0) {
                            oBusyDialog.close();
                            sap.m.MessageToast.show("No data found for the given ASN.");
                            return;
                        }

                        var oData = oResponse.results[0];
                        var materialDocNo = oData.Materialdocno;
                        var postingDate = that.getView().byId("PostingDate").getText();
                        var MaterialDocumentYear = oData.Fiscalyear;
                        var GateEntryNo = oData.asn;


                        if (!materialDocNo) {
                            oBusyDialog.close();
                            sap.m.MessageToast.show("No GRN found to cancel.");
                            return;
                        }

                        var dateParts = postingDate.split("-");
                        if (dateParts.length === 3) {
                            var formattedPostingDate = dateParts[2] + "-" + dateParts[1] + "-" + dateParts[0]; // Convert to YYYY-MM-DD
                        } else {
                            oBusyDialog.close();
                            MessageBox.error("Invalid posting date value.");
                            return;
                        }

                        var dateObj = new Date(formattedPostingDate);
                        if (isNaN(dateObj.getTime())) {
                            oBusyDialog.close();
                            MessageBox.error("Invalid posting date value.");
                            return;
                        }
                        var isoFormattedDate = dateObj.toISOString();
                        var formattedDateForRequest = isoFormattedDate.substring(0, 19);
                        $.ajax({
                            type: "GET",
                            url: "/sap/opu/odata/sap/API_MATERIAL_DOCUMENT_SRV/",
                            beforeSend: function (xhr) {
                                xhr.setRequestHeader("X-CSRF-Token", "Fetch");
                            },
                            success: function (data, textStatus, jqXHR) {
                                var token = jqXHR.getResponseHeader("X-CSRF-Token");
                                $.ajax({
                                    type: "POST",
                                    url: "/sap/opu/odata/sap/API_MATERIAL_DOCUMENT_SRV/Cancel?" +
                                        "MaterialDocumentYear='" + MaterialDocumentYear + "'" +
                                        "&MaterialDocument='" + materialDocNo + "'" +
                                        "&PostingDate=datetime'" + formattedDateForRequest + "'",
                                    headers: {
                                        "X-CSRF-TOKEN": token,
                                        "Accept": "application/json",
                                        "Authorization": "Basic UFAwMTpOREdrbGRXVm5oc3l5bFZUekF6WUdNdXJvcHlOVEUtYXhUNmNBUHFn"
                                    },
                                    data: JSON.stringify({
                                        "MaterialDocument": materialDocNo,
                                        "PostingDate": postingDate + "T00:00:00",
                                        "DocumentYear": MaterialDocumentYear
                                    }),
                                    contentType: "application/json; charset=utf-8",
                                    success: function (data) {
                                        var matdoc = data.d.MaterialDocument
                                        oBusyDialog.close();
                                        MessageBox.success("GRN Cancelled successfully with Material document: " + matdoc, {
                                            onClose: function (oAction) {
                                                if (oAction === MessageBox.Action.OK || oAction === MessageBox.Action.CLOSE || oAction === null) {
                                                    var oPayload = {
                                                        headerData: {
                                                            matdoc,
                                                            GateEntryNo,
                                                            postingDate,
                                                            MaterialDocumentYear,
                                                            "Type": "GRNCancel"

                                                        }
                                                    };
                                                    $.ajax({
                                                        type: "POST",
                                                        url: "/sap/bc/http/sap/ZMM_GRN_HTTP?&Type=GRNCancel",
                                                        contentType: "application/json",
                                                        data: JSON.stringify(
                                                            // matdoc,
                                                            // GateEntryNo,
                                                            // postingDate,
                                                            // MaterialDocumentYear

                                                            oPayload

                                                        ),
                                                        success: function (response) {
                                                            console.log("MaterialDocument sent to HTTP service successfully.");
                                                        },
                                                        error: function (xhr, status, error) {
                                                            console.error("Error sending MaterialDocument to HTTP service: ", error);
                                                        }
                                                    });

                                                    window.history.go(-1);
                                                }
                                            }
                                        });
                                    }.bind(this),
                                    error: function (error) {
                                        oBusyDialog.close();
                                        var message = error.responseJSON?.error?.message?.value || "Cancellation failed";
                                        MessageBox.error(message);
                                    }
                                });
                            },
                            error: function () {
                                oBusyDialog.close();
                                MessageBox.error("Failed to fetch CSRF token.");
                            }
                        });
                    },
                    error: function () {
                        oBusyDialog.close();
                        MessageBox.error("Failed to fetch Header data.");
                    }
                });
            }
            else {
                oModel.read("/Header", {
                    filters: aFilters,
                    success: function (oResponse) {
                        oBusyDialog.close();

                        if (oResponse.results.length === 0) {
                            sap.m.MessageToast.show("No data found for the given ASN.");
                            window.history.go(-1);
                            return;
                        }

                        var oData = oResponse.results[0];

                        if (oData.Status === "05") {
                            MessageBox.error("Gate Entry is Deleted", { duration: 2200 });
                            setTimeout(() => window.history.go(-1), 2200);
                            return;
                        }

                        if (oData.Materialdocno) {
                            MessageBox.error("Scanned ASN is already posted", { duration: 2200 });
                            setTimeout(() => window.history.go(-1), 2200);
                            return;
                        }

                        // Populate view with details
                        var goodsreceipt = oData.Inwardtype;
                        var GRGoodReceipt = (goodsreceipt === "RECPO") ? "101" : (goodsreceipt === "RECASIS") ? "542" : "";

                        that.getView().byId("TypeOfPosting").setText(goodsreceipt === "RECPO" ? "GOODS RECEIPT" : "TRANSFER POSTING");
                        that.getView().byId("PONumber").setText(oData.Ponumber || "");
                        that.getView().byId("DelChallNo").setText(goodsreceipt === "RECASIS" ? oData.Ponumber : "");
                        that.getView().byId("GateEntryID").setText(oData.asn);
                        that.getView().byId("Plant").setText(oData.Plant);
                        that.getView().byId("InwardType").setText(goodsreceipt);
                        that.getView().byId("InvoiceDate").setText(that._formatDate(oData.InvoiceDate));

                        //  that.getView().byId("InvoiceDate").setText(that._formatDate(oData.InvoiceDate));
                        that.getView().byId("LRDate").setText(that._formatDate(oData.Lrdate));

                        that.getView().byId("invoiceNo").setText(oData.InvoiceNo);
                        that.getView().byId("LRNumber").setText(oData.Lrnumber);
                        that.getView().byId("EwayBillNo").setText(oData.Ewayno);
                        that.getView().byId("VehicleNo").setText(oData.Vehicleno);
                        that.getView().byId("Transporter").setText(oData.Transporter);
                        that.getView().byId("Supplier").setText(oData.Vendor);
                        that.getView().byId("SupplierName").setText(oData.VendorName);
                        that.getView().byId("GRGoodReceipt").setText(GRGoodReceipt);

                        var oJSONModel = new sap.ui.model.json.JSONModel(oData);
                        oComponent.setModel(oJSONModel, "HeaderDataModel");

                        that.ScreenRefreshFunctionTable(); // Refresh table data
                    },
                    error: function () {
                        oBusyDialog.close();
                        sap.m.MessageToast.show("Error fetching data.");
                    }
                });
            }
        },
        _formatDate: function (oDate) {
            // Handle null, undefined, or zero dates
            if (!oDate || oDate === "0" || oDate === 0) {
                return "";
            }

            var date = new Date(oDate);

            // If date is invalid (NaN), return fallback
            if (isNaN(date.getTime())) {
                return "";
            }

            var day = String(date.getDate()).padStart(2, '0');
            var month = String(date.getMonth() + 1).padStart(2, '0');
            var year = date.getFullYear();

            return day + "-" + month + "-" + year;
        },

        ScreenRefreshFunctionTable: function () {
            var that = this;
            //   var Plant = that.gewtView().byId("Plant").getText();
            //	var aTable2 = that.getView().getModel('oTableDataModel2').getProperty("/aTableData2");
            var Plant = that.getView().byId("Plant").getText();
            var oTable = that.getView().byId("myTable2");
            var oItems = oTable.getItems();

            oItems.forEach(function (oItem) {
                var oBatchInput = oItem.getCells()[6];

                if (Plant === "1400") {
                    oBatchInput.setEditable(true);
                } else {
                    oBatchInput.setEditable(false);
                }
            });
            var oBusyDialog = new sap.m.BusyDialog({
                title: "Loading",
                text: "Please wait..."
            });
            oBusyDialog.open();

            var oModel = new sap.ui.model.odata.v2.ODataModel("/sap/opu/odata/sap/ZGRN_SERV", {
                defaultBindingMode: sap.ui.model.BindingMode.TwoWay,
                refreshAfterChange: true
            });

            oModel.metadataLoaded().then(function () {
                console.log("Metadata loaded, proceeding with OData call...");

                var oComponent = that.getOwnerComponent();
                var ObjectModel = oComponent.getModel("ObjectModel");
                var InwardType = that.getView().byId("InwardType").getText();

                if (!ObjectModel) {
                    oBusyDialog.close();
                    sap.m.MessageToast.show("System error: Object model missing.");
                    return;
                }

                var oTableModel = oComponent.getModel("oTableDataModel");
                if (!oTableModel) {
                    oBusyDialog.close();
                    sap.m.MessageToast.show("System error: Table data model missing.");
                    return;
                }

                var asn = ObjectModel.getProperty("/object/asn");

                if (!asn || asn === "") {
                    oBusyDialog.close();
                    sap.m.MessageToast.show("ASN is missing!");
                    return;
                }

                var aFilters = [new sap.ui.model.Filter("GateEntryId", sap.ui.model.FilterOperator.EQ, asn)];

                oModel.read("/Lineitem", {
                    filters: aFilters,
                    success: function (oResponse) {
                        oBusyDialog.close();

                        if (oResponse.results.length > 0) {
                            var aTableData = [];
                            var showMyTable2 = false;
                            var hasPurchaseOrderItemCategory3 = false;

                            oResponse.results.forEach(function (item) {
                                // Ensure Material has 18 digits
                                if (item.Material && item.Material.substring(0, 10) !== "0000000000") {
                                    item.Material = "0000000000" + item.Material;
                                }

                                // Show Table 2 if Item Category is 3
                                if (item.PurchaseOrderItemCategory === "3") {
                                    showMyTable2 = true;
                                    hasPurchaseOrderItemCategory3 = true;
                                }

                                if (item.Inwardtype === "RECPO") {
                                    if (item.Postedquantity !== "0.00") {
                                        aTableData.push(item);
                                        that.getView().byId("idPostQty1").setVisible(true)
                                        that.getView().byId("idItemCat1").setVisible(true)
                                    }
                                } else if (item.Inwardtype === "RECASIS") {
                                    if (item.Quantity !== "0.00") {

                                        item.Ponumber = "";
                                        that.getView().byId("idPostQty1").setVisible(false)
                                        that.getView().byId("idItemCat1").setVisible(false)

                                        aTableData.push(item);
                                    }
                                }
                            });

                            that.getView().byId("myTable2").setVisible(showMyTable2);
                            var Plant = that.getView().byId("Plant").getText();
                            var oTable = that.getView().byId("myTable2");
                            var oItems = oTable.getItems();

                            oItems.forEach(function (oItem) {
                                var oBatchInput = oItem.getCells()[6];

                                if (Plant != "1400") {
                                    oBatchInput.setEditable(false);
                                } else {
                                    oBatchInput.setEditable(true);
                                }
                            });
                            oItems.forEach(function (oItem) {
                                var oBatchInput = oItem.getCells()[6];

                                if (Plant === "1400") {
                                    oBatchInput.setEditable(true);
                                } else {
                                    oBatchInput.setEditable(false);
                                }
                            });
                            if (aTableData.length > 0) {
                                that.getView().getModel("oTableDataModel").setProperty("/aTableData", aTableData);

                                if (hasPurchaseOrderItemCategory3) {
                                    that.handleTwoEntity();
                                }
                            } else {
                                sap.m.MessageToast.show("No valid data found for the given ASN.");
                                that.getView().getModel("oTableDataModel").setProperty("/aTableData", []);
                            }
                        } else {
                            sap.m.MessageToast.show("No data found for the given ASN.");
                        }
                    },
                    error: function (oError) {
                        oBusyDialog.close();
                        console.error("OData Fetch Error:", oError);
                        sap.m.MessageToast.show("Error fetching data.");
                    }
                });
            }).catch(function () {
                oBusyDialog.close();
                console.error("Metadata failed to load");
                sap.m.MessageToast.show("Error loading metadata.");
            });
        },

        handle_table2Data: function () {
            var oBusyDialog = new sap.m.BusyDialog({ text: "Please Wait" });
            oBusyDialog.open();

            if (!this.getView().getModel("oTableDataModel2")) {
                var oModel2 = new sap.ui.model.json.JSONModel();
                oModel2.setDefaultBindingMode(sap.ui.model.BindingMode.TwoWay);
                this.getView().setModel(oModel2, "oTableDataModel2");
            }

            var firstTableData = this.getView().getModel("oTableDataModel").getProperty("/aTableData");
            var oModel = this.getView().getModel();
            var aTableArr2 = [];


            var aSubcomponentFilters = firstTableData.map(function (row) {
                return new sap.ui.model.Filter({
                    filters: [
                        new sap.ui.model.Filter("Ponumber", "EQ", row.Ponumber),
                        new sap.ui.model.Filter("GateEntryId", "EQ", row.GateEntryId)
                    ],
                    and: true
                });
            });


            oModel.read("/subcomponent", {
                filters: aSubcomponentFilters,
                urlParameters: { "$top": "5000" },
                success: function (oSubResponse) {
                    if (oSubResponse.results && oSubResponse.results.length > 0) {
                        oSubResponse.results.forEach(function (item) {
                            aTableArr2.push({
                                GateEntryId: item.GateEntryId || "",
                                Ponumber: item.Ponumber || "",
                                Itemno: item.Itemno || "",
                                Material: "0000000000" + item.BillOfMaterialComponent || "",
                                Materialdesc: item.ProductDescription || "",
                                StorageLocation: item.StorageLocation || "",
                                MovementType: "543",
                                Postedquantity: item.RequiredQuantity || "",
                                BaseUnit: item.BaseUnit || ""
                            });
                        });
                    } else {
                        sap.m.MessageToast.show("No matching subcomponent items found.");
                    }

                    this.getView().getModel("oTableDataModel2").setProperty("/aTableData2", aTableArr2);
                    console.log("Subcomponent data set to second table:", aTableArr2);
                    oBusyDialog.close();
                }.bind(this),
                error: function (oError) {
                    oBusyDialog.close();
                    console.error("Subcomponent fetch failed:", oError);
                    var sMessage = oError.message || "Unknown error";
                    if (oError.responseText) {
                        try {
                            var oErrorObj = JSON.parse(oError.responseText);
                            if (oErrorObj.error && oErrorObj.error.message && oErrorObj.error.message.value) {
                                sMessage = oErrorObj.error.message.value;
                            }
                        } catch (e) {
                            sMessage = oError.responseText;
                        }
                    }
                    sap.m.MessageBox.show(sMessage, {
                        title: "Error (Subcomponent)",
                        icon: sap.m.MessageBox.Icon.ERROR
                    });
                }
            });
        },

        handleTwoEntity: function () {
            var purchaseNum = this.getView().byId("PONumber").getText();
            if (purchaseNum.startsWith("55")) {
                this.handle_table2Data();
            } else {
                this.handle_table2Data111N();
            }
        },

        onSave_MovementType101: function (oEvent) {
            var oBusyDialog = new sap.m.BusyDialog({
                title: "Processing",
                text: "Processing for Post Data..."
            });

            var aTableData = this.getView().getModel('oDataModel').getProperty("/aTableData");
            console.log("MY DATA", aTableData);

            // Check if any item in aTableData has an invalid Storage Location
            var aInvalidItems = aTableData.filter(function (item) {
                return !item.StorageLocation || item.StorageLocation.trim() === "";
            });

            if (aInvalidItems.length > 0) {
                MessageBox.error("Storage Location cannot be empty for any selected item.");
                return;
            }
            if (!this.bQuantityFine) {
                MessageBox.warning('Quanity cannot be more than Posted Quantity!')
                return;
            }
            let that = this;
            let enteredQty =
                MessageBox.confirm("Do you want to Post?", {
                    actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                    emphasizedAction: MessageBox.Action.YES,
                    onClose: function (sAction) {
                        if (sAction === MessageBox.Action.NO) {
                            oBusyDialog.close();
                            return;
                        }

                        if (sAction === MessageBox.Action.YES) {
                            oBusyDialog.open();
                            // that.getView().setBusy(true);
                            var oPayload = {
                                headerData: {
                                    asn: this.getView().byId("GateEntryID").getText(),
                                    InwardType: this.getView().byId("InwardType").getText(),
                                    invoiceNo: this.getView().byId("invoiceNo").getText(),
                                    InvoiceDate: this.getView().byId("InvoiceDate").getText(),
                                    PONumber: this.getView().byId("PONumber").getText(),
                                    Supplier: this.extractValue(this.getView().byId("Supplier").getText()),
                                    GRGoodReceipt: this.getView().byId("GRGoodReceipt").getText(),
                                    PostingDate: this.getView().byId("PostingDate").getText(),
                                    TypeOfPosting: this.getView().byId("TypeOfPosting").getText(),
                                    LRNumber: this.getView().byId("LRNumber").getText(),
                                    LRDate: this.getView().byId("LRDate").getText(),
                                    EwayBillNo: this.getView().byId("EwayBillNo").getText(),
                                    Transporter: this.getView().byId("Transporter").getText(),
                                    VehicleNo: this.getView().byId("VehicleNo").getText(),
                                    Plant: this.extractValue(this.getView().byId("Plant").getText()),
                                    HeaderText: this.getView().byId("HeaderText").getValue(),
                                    Type: "Save",
                                },
                                tableData: aTableData.map(function (item) {
                                    return {
                                        "GateEntryId": item.GateEntryID,
                                        "Ponumber": item.PONumber,
                                        "Itemno": item.ItemNo,
                                        "Material": item.Material.replace(/^0+/, ''),
                                        "Materialdesc": item.MaterialDesc,
                                        "StorageLocation": item.StorageLocation,
                                        "Quantity": item.Entered,
                                        "Postedquantity": item.PostedQuantity,
                                        "BaseUnit": item.UOM,

                                    };
                                })
                            };

                            var url = "/sap/bc/http/sap/ZMM_GRN_HTTP";

                            $.ajax({
                                type: "POST",
                                url: url,
                                data: JSON.stringify(oPayload),
                                contentType: "application/json; charset=utf-8",
                                traditional: true,
                                success: function (data) {
                                    oBusyDialog.close();
                                    const match = data.match(/Document\s+(\d+)/);
                                    const documentNumber = match ? match[1] : null;
                                    if (data.startsWith("ERROR")) {
                                        oBusyDialog.close();
                                        // that.getView().setBusy(false);
                                        MessageBox.error(data);
                                    } else {
                                        var sAsn = oPayload.headerData.asn;
                                        if (data === '') {
                                            data = `Material Document ${documentNumber} posted sucessfully for ASN# ${sAsn}`;
                                        }
                                        that.getView().setBusy(false);
                                        sap.m.MessageBox.success(data, {
                                            actions: [MessageBox.Action.OK], // single button
                                            emphasizedAction: MessageBox.Action.OK,
                                            onClose: function (sAction) {
                                                if (sAction === MessageBox.Action.OK) {
                                                    // Copy to clipboard
                                                    navigator.clipboard.writeText(documentNumber).then(function () {
                                                        MessageToast.show("Material copied to clipboard!");
                                                        that.onNavBack();
                                                    }).catch(function (err) {
                                                        MessageToast.show("Failed to copy Material");
                                                        console.error(err);
                                                        that.onNavBack();
                                                    });

                                                    // Navigate back

                                                }
                                            },
                                        });

                                        // Override the default button text via CSS hack if needed:
                                        setTimeout(function () {
                                            var $btn = $(".sapMMessageBox .sapMBtn");
                                            if ($btn.length) {
                                                $btn.text("Copy");
                                            }
                                        }, 300);
                                    }
                                }.bind(this),
                                error: function (oError) {
                                    try {
                                        var sMessage = "";

                                        // Try to parse as JSON first
                                        try {
                                            var oResponse = JSON.parse(oError.responseText);
                                            if (oResponse?.error?.message?.value) {
                                                sMessage = oResponse.error.message.value;
                                            }
                                        } catch (parseErr) {
                                            // If parsing JSON fails, try to extract from HTML
                                            var match = oError.responseText.match(/<span id="msgText">(.*?)<\/span>/);
                                            if (match && match[1]) {
                                                sMessage = match[1]; // e.g. "Field symbol has not been assigned yet."
                                            }
                                        }

                                        // If nothing found, fallback
                                        if (!sMessage) {
                                            sMessage = "An unexpected error occurred (Status " + oError.status + ")";
                                        }

                                        // Show user-friendly message
                                        // sap.m.MessageToast.show(sMessage + ", GRN creation cancelled !");
                                        MessageBox.error(sMessage + ", GRN creation cancelled !");

                                    } catch (e) {
                                        sap.m.MessageToast.show("Error handling server response");
                                    } finally {
                                        oBusyDialog.close();
                                    }
                                }

                            });
                        }
                        oBusyDialog.close();
                    }.bind(this)
                });
        },
        onPostedQtyChange: function (oEvent) {
            var oRow = oEvent.getSource().getParent();  // ColumnListItem
            var oQuantityInput = oRow.getCells()[7];    // index of idQuantity column
            var iQty = parseFloat(oQuantityInput.getValue()) || 0;
            let oInput = oEvent.getSource();
            let oContext = oInput.getBindingContext("oDataModel");

            let iPostedQty = parseFloat(oContext.getProperty("PostedQuantity")) || 0;
            if (iPostedQty < iQty) {
                this.bQuantityFine = false;
                oInput.setValueState("Error");
                oInput.setValueStateText("Quantity cannot be greater than Posted Quantity");
            } else {
                this.bQuantityFine = true;
                oInput.setValueState("None");
                oInput.setValueStateText("");
            }
        },

        onSave: function () {
            var that = this;
            var oBusyDialog = new sap.m.BusyDialog({
                text: "Please Wait"
            });

            var Supplier = this.extractValue(this.getView().byId("Supplier").getText());
            var Plant = this.extractValue(this.getView().byId("Plant").getText());
            var GateEntryID = this.getView().byId("GateEntryID").getText();
            var PostingDate = this.getView().byId("PostingDate").getText().trim();

            if (PostingDate && PostingDate.includes("-")) {
                var parts = PostingDate.split("-");
                PostingDate = parts[2] + "-" + parts[1] + "-" + parts[0];
            }

            var InvoiceDate = this.getView().byId("InvoiceDate").getText();
            var invoiceParts = InvoiceDate.split("-");
            var invoice_dat = invoiceParts[2] + "-" + invoiceParts[1] + "-" + invoiceParts[0];
            var invoiceNo = this.getView().byId("invoiceNo").getText();

            var tableListitem = [];

            var aTableData = this.getView().getModel("oDataModel").getProperty("/aTableData");
            var aError = [];
            aTableData.map(function (item1) {
                var aFilterData = aTableData.filter(item2 => item2.Material === item1.Material);
                var ttlQty = 0;
                aFilterData.map(function (item) {
                    ttlQty = ttlQty + Number(item.BatchQty)
                })
                if (ttlQty > Number(item1.Quantity)) {
                    aError.push(item1.Material);
                }
            })
            if (aError.length != 0) {
                // console.log();
                MessageBox.error('Materials ' + aError.toString() + ' Have a incorrect Batch Quantity');
                return;
            }
            else {
                oBusyDialog.open();
                if (that.getView().byId("InwardType").getText() != 'RECASIS') {
                    if (aTableData.length != 0) {
                        var a543avl = false;
                        aTableData.map(function (item) {
                            if (item.MovementType == '543') {
                                a543avl = true;
                            }
                        })
                        if (a543avl == true) {
                            var lines = 1;
                            var abcd = that.getView().byId("LRDate").getText();
                            aTableData.map(function (item) {
                                if (item.MovementType != '543') {
                                    tableListitem.push({
                                        "Material": item.Material.replace(/^0+/, ''),
                                        "Plant": Plant,
                                        "StorageLocation": item.StorageLocation,
                                        "GoodsMovementType": "101",
                                        "InventoryValuationType": "",
                                        "InventorySpecialStockType": "",
                                        "Supplier": Supplier,
                                        "Customer": "",
                                        "SalesOrder": "",
                                        "SalesOrderItem": "",
                                        "SalesOrderScheduleLine": "0",
                                        "PurchaseOrder": item.PONumber,
                                        "PurchaseOrderItem": item.ItemNo,
                                        "GoodsMovementRefDocType": "B",
                                        "GoodsMovementReasonCode": "0",
                                        "EntryUnit": item.UOM,
                                        // "QuantityInEntryUnit": "'"+item.PostedQuantity+"'",
                                        "QuantityInEntryUnit": item.PostedQuantity == '' ? null : (item.PostedQuantity).toString(),
                                        "IsCompletelyDelivered": false,
                                        "ReservationIsFinallyIssued": false,
                                        "SpecialStockIdfgSalesOrder": "",
                                        "SpecialStockIdfgSalesOrderItem": "",
                                        "MaterialDocumentLine": ((item.ItemNo).toString()).padStart(6, '0'),
                                        "MaterialDocumentParentLine": "",
                                        'YY1_VehicleNo1_MMI': that.getView().byId("VehicleNo").getText(),
                                        'YY1_Transporter_Name_MMI': that.getView().byId("Transporter").getText(),
                                        'YY1_LR_DATE1_MMI': new Date(that.getView().byId("LRDate").getText()) == 'Invalid Date' || that.getView().byId("LRDate").getText() == '' ? null : abcd.split('-')[2] + '-' + abcd.split('-')[0] + '-' + abcd.split('-')[1] + 'T00:00:00',
                                        // 'YY1_LR_DATE1_MMI': new Date(that.getView().byId("LRDate").getText()) == 'Invalid Date' || that.getView().byId("LRDate").getText() == '' ? null : that.getView().byId("LRDate").getText(),
                                        'YY1_LR_NO1_MMI': that.getView().byId("LRNumber").getText(),
                                        'YY1_E_WAYBILLNo_MMI': that.getView().byId("EwayBillNo").getText(),
                                        // 'YY1_DeliveryChallanNo_MMI': that.getView().byId("").getText(),
                                        // 'YY1_DeliveryChallanDat_MMI': that.getView().byId("").getText(),
                                    });
                                    lines = 1;
                                } else {
                                    tableListitem.push({
                                        "Material": item.Material.replace(/^0+/, ''),
                                        "Plant": Plant,
                                        "StorageLocation": item.StorageLocation,
                                        "Batch": item.Batch,
                                        "GoodsMovementType": "543",
                                        "InventoryValuationType": "",
                                        "InventorySpecialStockType": "",
                                        "Supplier": Supplier,
                                        "Customer": "",
                                        "SalesOrder": "",
                                        "SalesOrderItem": "0",
                                        "SalesOrderScheduleLine": "0",
                                        "PurchaseOrder": item.PONumber,
                                        "PurchaseOrderItem": item.ItemNo,
                                        "GoodsMovementRefDocType": "B",
                                        "GoodsMovementReasonCode": "0",
                                        "EntryUnit": item.UOM,
                                        // "QuantityInEntryUnit": (item.PostedQuantity),
                                        "QuantityInEntryUnit": Plant == '1400' ? ((item.BatchQty == '' ? null : (item.BatchQty).toString())) : (item.PostedQuantity == '' ? null : (item.PostedQuantity).toString()),
                                        // "QuantityInEntryUnit": item.PostedQuantity == '' ? null : (item.PostedQuantity).toString(),
                                        "IsCompletelyDelivered": false,
                                        "ReservationIsFinallyIssued": false,
                                        "SpecialStockIdfgSalesOrder": "",
                                        "SpecialStockIdfgSalesOrderItem": "",
                                        "MaterialDocumentLine": (Number(item.ItemNo) + lines).toString().padStart(6, '0'),
                                        "MaterialDocumentParentLine": (item.ItemNo).toString().padStart(6, '0'),
                                        'YY1_VehicleNo1_MMI': that.getView().byId("VehicleNo").getText(),
                                        'YY1_Transporter_Name_MMI': that.getView().byId("Transporter").getText(),
                                        'YY1_LR_DATE1_MMI': new Date(that.getView().byId("LRDate").getText()) == 'Invalid Date' || that.getView().byId("LRDate").getText() == '' ? null : abcd.split('-')[2] + '-' + abcd.split('-')[0] + '-' + abcd.split('-')[1] + 'T00:00:00',
                                        // 'YY1_LR_DATE1_MMI': new Date(that.getView().byId("LRDate").getText()) == 'Invalid Date' || that.getView().byId("LRDate").getText() == '' ? null : that.getView().byId("LRDate").getText(),
                                        'YY1_LR_NO1_MMI': that.getView().byId("LRNumber").getText(),
                                        'YY1_E_WAYBILLNo_MMI': that.getView().byId("EwayBillNo").getText(),
                                        // 'YY1_DeliveryChallanNo_MMI': that.getView().byId("").getText(),
                                        // 'YY1_DeliveryChallanDat_MMI': that.getView().byId("").getText(),

                                    });
                                    lines++;
                                }

                            })

                            //    var oPayload = {
                            var headerData = {
                                GateEntryID: that.getView().byId("GateEntryID").getText(),
                                InwardType: that.getView().byId("InwardType").getText(),
                                invoiceNo: that.getView().byId("invoiceNo").getText(),
                                InvoiceDate: that.getView().byId("InvoiceDate").getText(),
                                PONumber: that.getView().byId("PONumber").getText(),
                                Supplier: that.extractValue(that.getView().byId("Supplier").getText()),
                                GRGoodReceipt: that.getView().byId("GRGoodReceipt").getText(),
                                PostingDate: that.getView().byId("PostingDate").getText(),
                                TypeOfPosting: that.getView().byId("TypeOfPosting").getText(),
                                LRNumber: that.getView().byId("LRNumber").getText(),
                                LRDate: that.getView().byId("LRDate").getText(),
                                EwayBillNo: that.getView().byId("EwayBillNo").getText(),
                                Transporter: that.getView().byId("Transporter").getText(),
                                VehicleNo: that.getView().byId("VehicleNo").getText(),
                                Plant: that.extractValue(that.getView().byId("Plant").getText()),
                                HeaderText: that.getView().byId("HeaderText").getValue(),
                                //       Type: "Save",
                            }
                            //       }
                            var combinedTableItems = tableListitem;
                            var url = "/sap/opu/odata/sap/API_MATERIAL_DOCUMENT_SRV/A_MaterialDocumentHeader";
                            $.ajax({
                                type: "GET",
                                url: url,
                                contentType: "application/json",
                                dataType: 'json',
                                beforeSend: function (xhr) {
                                    xhr.setRequestHeader('X-CSRF-Token', 'fetch');
                                },
                                complete: function (response) {
                                    var token = response.getResponseHeader('X-CSRF-Token');
                                    $.ajax({
                                        type: "POST",
                                        url: url,
                                        headers: {
                                            "X-CSRF-TOKEN": token,
                                            "Accept": "application/json",
                                            "Authorization": "Basic UFAwMTpOREdrbGRXVm5oc3l5bFZUekF6WUdNdXJvcHlOVEUtYXhUNmNBUHFn"
                                        },
                                        data: JSON.stringify({
                                            "ReferenceDocument": invoiceNo,
                                            "GoodsMovementCode": "01",
                                            "DocumentDate": invoice_dat + "T00:00:00",
                                            "PostingDate": PostingDate + "T00:00:00",
                                            "MaterialDocumentHeaderText": GateEntryID,
                                            "to_MaterialDocumentItem": combinedTableItems
                                        }),
                                        contentType: "application/json; charset=utf-8",
                                        traditional: true,
                                        success: function (data) {
                                            oBusyDialog.close();
                                            let Material = data.d.MaterialDocument;
                                            var tableData = [{
                                                MaterialDocument: Material,
                                                GateEntrynO: GateEntryID,
                                                Type: "Update",
                                            }]
                                            $.ajax({
                                                type: "POST",
                                                url: "/sap/bc/http/sap/ZMM_GRN_HTTP?&Type=MaterialDocNo",
                                                contentType: "application/json",
                                                data: JSON.stringify({
                                                    headerData,
                                                    tableData
                                                    // MaterialDocument: Material,
                                                    // GateEntrynO: GateEntryID,
                                                    // Type : "Update"

                                                }),
                                                success: function (response) {
                                                    console.log("MaterialDocument sent to HTTP service successfully.");
                                                    MessageBox.success("Material Number: " + Material + " Generated Successfully", {
                                                        onClose: function (oAction) {
                                                            if (oAction === MessageBox.Action.OK || oAction === MessageBox.Action.CLOSE || oAction === null) {



                                                                window.history.go(-1);
                                                            }
                                                            //    else if(oAction === null){
                                                            //         window.history.go(-1);
                                                            //     }
                                                        }
                                                    });
                                                },
                                                error: function (xhr, status, error) {
                                                    console.error("Error sending MaterialDocument to HTTP service: ", error);
                                                }
                                            });
                                        }.bind(this),

                                        error: function (error) {
                                            let message1 = error.responseJSON.error.message.value;
                                            MessageBox.error(message1, {
                                                onClose: function (oAction) {

                                                }
                                            });
                                            oBusyDialog.close();
                                        }
                                    });
                                }
                            });
                        } else {
                            oBusyDialog.close();
                            that.onSave_MovementType101();
                        }
                    }
                    else {
                        oBusyDialog.close();
                        that.onSave_MovementType101();
                    }
                } else {
                    oBusyDialog.close();
                    that.onSave_MovementType101();
                }
            }
        },
        onSave11: function (oEvent) {
            var oBusyDialog = new sap.m.BusyDialog({
                title: "Processing",
                text: "Processing for Post Data..."
            });

            MessageBox.confirm("Do you want to Post?", {
                actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                emphasizedAction: MessageBox.Action.YES,
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.NO) {
                        oBusyDialog.close();
                        return;
                    }

                    if (sAction === MessageBox.Action.YES) {
                        oBusyDialog.open();

                        setTimeout(function () {
                            oBusyDialog.close();
                        }, 11000);

                        var oTable = this.getView().byId("myTable");
                        var oModel = this.getView().getModel("oTableDataModel");

                        if (!oModel) {
                            oBusyDialog.close();
                            MessageBox.error("Model 'oTableDataModel' not found. Please check the data binding.");
                            return;
                        }

                        var aTableData = oModel.getProperty("/");
                        console.log("Retrieved Table Data:", aTableData);

                        // Ensure aTableData is an array before using filter()
                        if (!Array.isArray(aTableData)) {
                            oBusyDialog.close();
                            MessageBox.error("Table data is not in the expected format. Please check the model data.");
                            return;
                        }

                        var aInvalidItems = aTableData.filter(function (item) {
                            return !item.StorageLocation || item.StorageLocation.trim() === "";
                        });

                        if (aInvalidItems.length > 0) {
                            oBusyDialog.close();
                            MessageBox.error("Storage Location cannot be empty for any item.");
                            return;
                        }

                        var oPayload = {
                            headerData: {
                                GateEntryID: this.getView().byId("GateEntryID").getText(),
                                InwardType: this.getView().byId("InwardType").getText(),
                                invoiceNo: this.getView().byId("invoiceNo").getText(),
                                InvoiceDate: this.getView().byId("InvoiceDate").getText(),
                                PONumber: this.getView().byId("PONumber").getText(),
                                Supplier: this.getView().byId("Supplier").getText(),
                                GRGoodReceipt: this.getView().byId("GRGoodReceipt").getText(),
                                PostingDate: this.getView().byId("PostingDate").getText(),
                                TypeOfPosting: this.getView().byId("TypeOfPosting").getText(),
                                LRNumber: this.getView().byId("LRNumber").getText(),
                                LRDate: this.getView().byId("LRDate").getText(),
                                EwayBillNo: this.getView().byId("EwayBillNo").getText(),
                                Transporter: this.getView().byId("Transporter").getText(),
                                VehicleNo: this.getView().byId("VehicleNo").getText(),
                                Plant: this.getView().byId("Plant").getText(),
                                HeaderText: this.getView().byId("HeaderText").getValue(),
                                Type: "Save",
                            },
                            tableData: aTableData.map(function (item) {
                                return {
                                    "GateEntryId": item.GateEntryId,
                                    "Ponumber": item.Ponumber,
                                    "Itemno": item.Itemno,
                                    "Material": item.Material,
                                    "Materialdesc": item.Materialdesc,
                                    "StorageLocation": item.StorageLocation,
                                    "Quantity": item.Quantity,
                                    "Postedquantity": item.Postedquantity,
                                };
                            })
                        };

                        console.log("Payload being sent:", oPayload);

                        var url = "/sap/bc/http/sap/ZMM_GRN_HTTP";

                        $.ajax({
                            type: "POST",
                            url: url,
                            data: JSON.stringify(oPayload),
                            contentType: "application/json; charset=utf-8",
                            traditional: true,
                            success: function (data) {
                                oBusyDialog.close();
                                if (data.startsWith("ERROR")) {
                                    MessageBox.error(data);
                                } else {
                                    MessageBox.success(data, {
                                        onClose: function (response) {
                                            if (response === MessageBox.Action.OK) {
                                                window.history.go(-1);
                                            }
                                        }
                                    });
                                }
                            }.bind(this),
                            error: function () {
                                oBusyDialog.close();
                                MessageBox.error("Data not saved");
                            }
                        });
                    }
                }.bind(this)
            });
        },

        onValueHelpRequestStorageLocation1: function (oEvent) {
            var oView = this.getView();
            this.oSource = oEvent.getSource();
            this.sPath = oEvent.getSource().getBindingContext('oTableDataModel').getPath();
            let plant = this.extractValue(oView.byId("Plant").getText());
            // Get the selected row data (Component)
            var oModel = this.getView().getModel('oTableDataModel');
            var oRowData = oModel.getProperty(this.sPath);
            var sComponent = oRowData.Material ? oRowData.Material.toString() : ""; // Ensure string format

            if (!this._pValueHelpDialog113) {
                this._pValueHelpDialog113 = Fragment.load({
                    id: oView.getId(),
                    name: "hodek.grnscan.fragments.StorageLocation",
                    controller: this
                }).then(function (oValueHelpDialog13) {
                    oView.addDependent(oValueHelpDialog13);
                    return oValueHelpDialog13;
                });
            }

            this._pValueHelpDialog113.then(function (oValueHelpDialog13) {
                var oTemplate = new sap.m.StandardListItem({
                    title: "{StorageLocation}",
                    description: "{StorageLocation}",
                    type: "Active"
                });

                // Create filter for Component
                var oFilter = new Filter("Product", FilterOperator.EQ, "'" + sComponent + "'"); // Ensure correct OData syntax
                var oFilter2 = new Filter("Plant", FilterOperator.EQ, "'" + plant + "'"); // Ensure correct OData syntax

                // Bind data to the dialog with the filter
                oValueHelpDialog13.bindAggregation("items", {
                    path: '/StorageLocation_F4',
                    filters: [oFilter, oFilter2],
                    template: oTemplate
                });

                oValueHelpDialog13.setTitle("Select Storage Location");
                oValueHelpDialog13.open();
            }.bind(this));
        },

        onValueHelpSearch131: function (oEvent3) {
            var sValue3 = oEvent3.getParameter("value");
            var oFilter = new Filter({
                filters: [
                    new Filter("StorageLocation", FilterOperator.Contains, sValue3),
                    new Filter("StorageLocation", FilterOperator.Contains, sValue3)
                ],
                and: false
            });
            var oBinding = oEvent3.getParameter("itemsBinding");
            oBinding.filter([oFilter]);
        },

        onValueHelpClose131: function (oEvent3) {
            var oSelectedItem13 = oEvent3.getParameter("selectedItem");

            if (!oSelectedItem13) {
                //       console.error("No item selected.");
                this.oSource.resetProperty("value");
                return;
            }

            var oSelectedContexts = oEvent3.getParameter("selectedContexts");

            if (!oSelectedContexts || oSelectedContexts.length === 0) {
                //       console.error("No selected context found.");
                return;
            }

            var sPath = oSelectedContexts[0].getPath();
            var oObject = oSelectedContexts[0].getObject();

            //  console.log("Selected Object:", oObject);

            if (oObject && oObject.StorageLocation) {
                this.oSource.setValue(oObject.StorageLocation);
            } else {
                //       console.error("StorageLocation is missing in selected object");
            }
        },


        // onValueHelpRequestStorageLocation: function (oEvent) {
        //     var oView = this.getView();
        //     this.oSource = oEvent.getSource();
        //     this.sPath = this.oSource.getBindingContext('oTableDataModel').getPath();

        //     // Get the selected row data (Component)
        //     var oModel = this.getView().getModel('oTableDataModel');
        //     var oRowData = oModel.getProperty(this.sPath);
        //     var sComponent1 = oRowData.Material ? oRowData.Material.toString() : ""; // Ensure string format
        //     var sComponent = sComponent1.slice(10)
        //     if (!this._pValueHelpDialog113) {
        //         this._pValueHelpDialog113 = Fragment.load({
        //             id: oView.getId(),
        //             name: "hodek.grnscan.fragments.StorageLocation",
        //             controller: this
        //         }).then(function (oValueHelpDialog113) {
        //             oView.addDependent(oValueHelpDialog113);
        //             return oValueHelpDialog113;
        //         });
        //     }

        //     this._pValueHelpDialog113.then(function (oValueHelpDialog113) {
        //         // Ensure existing aggregation is cleared before binding
        //         oValueHelpDialog113.unbindAggregation("items");

        //         var oTemplate = new sap.m.StandardListItem({
        //             title: "{StorageLocation}",
        //             description: "{StorageLocation}",
        //             type: "Active"
        //         });

        //         // Create filter for Component
        //         var oFilter = new Filter("Product", FilterOperator.EQ, sComponent); // Ensure correct syntax

        //         // Log filter information
        //         console.log("Applying Filter:", oFilter);

        //         // Bind data to the dialog with the filter
        //         oValueHelpDialog113.bindAggregation("items", {
        //             path: '/StorageLocation_F4',
        //             filters: [oFilter],
        //             template: oTemplate
        //         });

        //         oValueHelpDialog113.setTitle("Select Storage Location");
        //         oValueHelpDialog113.open();
        //     }.bind(this));
        // },

        // onValueHelpSearch13: function (oEvent3) {
        //     var sValue3 = oEvent3.getParameter("value");
        //     var oFilter = new Filter({
        //         filters: [
        //             new Filter("StorageLocation", FilterOperator.Contains, sValue3),
        //             new Filter("StorageLocation", FilterOperator.Contains, sValue3)
        //         ],
        //         and: false
        //     });

        //     var oBinding = oEvent3.getParameter("itemsBinding");
        //     oBinding.filter([oFilter]);
        // },

        // onValueHelpClose13: function (oEvent33) {
        //     var oSelectedItem133 = oEvent33.getParameter("selectedItem");

        //     if (!oSelectedItem133) {
        //         console.warn("No item selected.");
        //         this.oSource.resetProperty("value");
        //         return;
        //     }

        //     var oSelectedContexts3 = oEvent33.getParameter("selectedContexts");

        //     if (!oSelectedContexts3 || oSelectedContexts3.length === 0) {
        //         console.warn("No selected context found.");
        //         return;
        //     }

        //     var sPath = oSelectedContexts[0].getPath();
        //     var oObject = oSelectedContexts[0].getObject();

        //     console.log("Selected Object:", oObject);

        //     if (oObject && oObject.StorageLocation) {
        //         this.oSource.setValue(oObject.StorageLocation);
        //     } else {
        //         console.error("StorageLocation is missing in selected object");
        //     }
        // },
        // onValueHelpRequestStorageLocation: function (oEvent) {
        //     var oView = this.getView();
        //     this.oSource = oEvent.getSource();
        //     this.sPath = this.oSource.getBindingContext('oDataModel').getPath();

        //     var oModel = this.getView().getModel('oDataModel');
        //     var oRowData = oModel.getProperty(this.sPath);
        //     var sComponent1 = oRowData.Material ? oRowData.Material.toString() : "";
        //     var sComponent = sComponent1.slice(10); // Adjust based on actual data

        //     if (!this._pValueHelpDialog13) {
        //         this._pValueHelpDialog13 = Fragment.load({
        //             id: oView.getId(),
        //             name: "hodek.grnscan.fragments.StorageLocation",
        //             controller: this
        //         }).then(function (oValueHelpDialog13) {
        //             oView.addDependent(oValueHelpDialog13);
        //             return oValueHelpDialog13;
        //         });
        //     }

        //     this._pValueHelpDialog13.then(function (oValueHelpDialog13) {
        //         var oFilter = new Filter("Product", FilterOperator.EQ, sComponent);
        //         var oItemsBinding = oValueHelpDialog13.getBinding("items");
        //         if (oItemsBinding) {
        //             oItemsBinding.filter([oFilter]);
        //         }
        //         oValueHelpDialog13.open();
        //     }.bind(this));
        // },

        // onValueHelpSearch13: function (oEvent) {
        //     var sValue = oEvent.getParameter("value");
        //     var oFilter = new Filter("StorageLocation", FilterOperator.Contains, sValue);
        //     var oBinding = oEvent.getParameter("itemsBinding");
        //     oBinding.filter([oFilter]);
        // },

        // onValueHelpClose13: function (oEvent) {
        //     var oSelectedItem = oEvent.getParameter("selectedItem");
        //     if (!oSelectedItem) {
        //         this.oSource.setValue("");
        //         return;
        //     }

        //     var oContext = oEvent.getParameter("selectedContexts")?.[0];
        //     if (oContext) {
        //         var oObject = oContext.getObject();
        //         if (oObject && oObject.StorageLocation) {
        //             this.oSource.setValue(oObject.StorageLocation);
        //         }
        //     }
        // },


        onValueHelpRequestBatch11: function (oEvent) {
            var oView = this.getView();
            this.oSource = oEvent.getSource();
            this.sPath = this.oSource.getBindingContext('oTableDataModel2').getPath();

            var oModel = this.getView().getModel('oTableDataModel2');
            var oRowData = oModel.getProperty(this.sPath);
            var sComponent1 = oRowData.Material ? oRowData.Material.toString() : "";
            // var Batch = sComponent1.slice(10); // No longer needed if no filter

            if (!this._pValueHelpDialog113) {
                this._pValueHelpDialog113 = Fragment.load({
                    id: oView.getId(),
                    name: "zhodekgrnscan.fragments.Batch",
                    controller: this
                }).then(function (oValueHelpDialog113) {
                    oView.addDependent(oValueHelpDialog113);
                    return oValueHelpDialog113;
                });
            }

            this._pValueHelpDialog113.then(function (oValueHelpDialog113) {
                oValueHelpDialog113.unbindAggregation("items");

                var oTemplate = new sap.m.StandardListItem({
                    title: "{Batch}",
                    description: "{Batch}",
                    type: "Active"
                });

                // Bind without any filter
                oValueHelpDialog113.bindAggregation("items", {
                    path: '/BATCHF4',
                    template: oTemplate
                });

                oValueHelpDialog113.setTitle("Select Batch");
                oValueHelpDialog113.open();
            }.bind(this));
        },

        onValueHelpRequestBatch: function (oEvent) {
            var oView = this.getView();
            this.oSource = oEvent.getSource();
            this.sPath = this.oSource.getBindingContext('oTableDataModel2').getPath();

            var oModel = oView.getModel('oTableDataModel2');
            var oRowData = oModel.getProperty(this.sPath);
            var sComponent1 = oRowData.Material ? oRowData.Material.toString() : "";

            if (!this._pValueHelpDialog113) {
                this._pValueHelpDialog113 = Fragment.load({
                    id: oView.getId(),
                    name: "zhodekgrnscan.fragments.Batch",
                    controller: this
                }).then(function (oValueHelpDialog113) {
                    oView.addDependent(oValueHelpDialog113);
                    return oValueHelpDialog113;
                });
            }

            this._pValueHelpDialog113.then(function (oValueHelpDialog113) {
                oValueHelpDialog113.unbindAggregation("items");

                var oTemplate = new sap.m.StandardListItem({
                    title: "{Batch}",
                    //   description: "{Batch}",
                    type: "Active"
                });

                var oFilter = new Filter("Material", FilterOperator.EQ, sComponent1);

                oValueHelpDialog113.bindAggregation("items", {
                    path: '/BATCHF4',
                    filters: [oFilter],
                    template: oTemplate
                });

                oValueHelpDialog113.setTitle("Select Batch");
                oValueHelpDialog113.open();
            }.bind(this));
        },

        onValueHelpSearch131: function (oEvent3) {
            var sValue3 = oEvent3.getParameter("value");
            var oFilter = new Filter({
                filters: [
                    new Filter("BATCHF4", FilterOperator.Contains, sValue3),
                    // new Filter("StorageLocation", FilterOperator.Contains, sValue3)
                ],
                and: false
            });

            var oBinding = oEvent3.getParameter("itemsBinding");
            oBinding.filter([oFilter]);
        },

        onValueHelpClose131: function (oEvent3) {
            var oSelectedItem13 = oEvent3.getParameter("selectedItem");

            if (!oSelectedItem13) {
                console.warn("No item selected.");
                this.oSource.resetProperty("value");
                return;
            }

            var oSelectedContexts = oEvent3.getParameter("selectedContexts");

            if (!oSelectedContexts || oSelectedContexts.length === 0) {
                console.warn("No selected context found.");
                return;
            }

            var sPath = oSelectedContexts[0].getPath();
            var oObject = oSelectedContexts[0].getObject();

            console.log("Selected Object:", oObject);

            if (oObject && oObject.Batch) {
                this.oSource.setValue(oObject.Batch);
            } else {
                console.error("Batch is missing in selected object");
            }
        },
        onValueHelpRequestBatch: function (oEvent) {
            var oView = this.getView();
            this.oSource = oEvent.getSource();
            this.sPath = this.oSource.getBindingContext('oTableDataModel2').getPath();

            var oModel = oView.getModel('oTableDataModel2');
            var oRowData = oModel.getProperty(this.sPath);
            var sComponent1 = oRowData.Material ? oRowData.Material.toString() : "";

            if (!this._pValueHelpDialog113) {
                this._pValueHelpDialog113 = Fragment.load({
                    id: oView.getId(),
                    name: "zhodekgrnscan.fragments.Batch",
                    controller: this
                }).then(function (oValueHelpDialog113) {
                    oView.addDependent(oValueHelpDialog113);
                    return oValueHelpDialog113;
                });
            }

            this._pValueHelpDialog113.then(function (oValueHelpDialog113) {
                var oFilter = new Filter("Material", FilterOperator.EQ, sComponent1);

                var oItemsBinding = oValueHelpDialog113.getBinding("items");
                if (oItemsBinding) {
                    oItemsBinding.filter([oFilter]);
                }

                oValueHelpDialog113.setTitle("Select Batch");
                oValueHelpDialog113.open();
            }.bind(this));
        },
        onValueHelpSearch131: function (oEvent3) {
            var sValue3 = oEvent3.getParameter("value");
            var oFilter = new Filter({
                filters: [
                    new Filter("Batch", FilterOperator.Contains, sValue3) // Fixed property name
                ],
                and: false
            });
            var oBinding = oEvent3.getParameter("itemsBinding");
            oBinding.filter([oFilter]);
        },

        onValueHelpClose131: function (oEvent3) {
            var oSelectedItem13 = oEvent3.getParameter("selectedItem");

            if (!oSelectedItem13) {
                console.warn("No item selected.");
                this.oSource.setValue(""); // Reset input if nothing selected
                return;
            }

            var oSelectedContexts = oEvent3.getParameter("selectedContexts");

            if (!oSelectedContexts || oSelectedContexts.length === 0) {
                console.warn("No selected context found.");
                return;
            }

            var oObject = oSelectedContexts[0].getObject();
            console.log("Selected Object:", oObject);

            if (oObject && oObject.Batch) {
                this.oSource.setValue(oObject.Batch);
            } else {
                console.error("Batch is missing in selected object");
            }
        },

        onBatchalueHelpRequest: function (oEvent) {
            var oView = this.getView();
            this.oSource = oEvent.getSource();
            this.sPath = this.oSource.getBindingContext('oDataModel').getPath();
            this.tabIndex = (oEvent.getSource().getBindingContext('oDataModel').getPath()).split("/aTableData/")[1];
            var oModel = oView.getModel('oDataModel');
            var oRowData = oModel.getProperty(this.sPath);
            var sComponent1 = oRowData.Material ? oRowData.Material.toString() : "";
            var oFilter = new Filter("Material", 'EQ', sComponent1);
            const oDialog = this.byId("idBatchSelectDialog");
            oDialog.getBinding("items").filter(oFilter);
            oDialog.open();
        },
        onBatchSelectDialogSearch: function (oEvent3) {
            var sValue3 = oEvent3.getParameter("value");
            var oFilter = new Filter({
                filters: [
                    new Filter("Batch", FilterOperator.Contains, sValue3) // Fixed property name
                ],
                and: false
            });
            var oBinding = oEvent3.getParameter("itemsBinding");
            oBinding.filter([oFilter]);
        },

        onBatchSelectDialogConfirm: function (oEvent) {
            // var oObject = oEvent.getParameter("selectedContexts")[0].getObject()
            // var sPath = this.sPath;
            // this.getView().getModel('oDataModel').getProperty(sPath).Batch = oObject.Batch;
            // // this.getView().getModel('oDataModel').getProperty(sPath).BatchQty = oObject.Qty;
            // this.getView().getModel('oDataModel').setProperty(sPath, this.getView().getModel('oDataModel').getProperty(sPath));



            var oBinding = oEvent.getSource().getBinding("items");
            oBinding.filter([]);
            var that = this;
            var oTableModel = that.getView().getModel('oDataModel');
            var aContexts = oEvent.getParameter("selectedContexts");
            if (aContexts && aContexts.length) {
                var Batch_Arr = [];
                aContexts.map(function (oContext) {
                    Batch_Arr.push(oContext.getObject())
                })
                var aNewArr = [];
                that.getView().getModel('oDataModel').getProperty("/aTableData").map(function (item, index) {
                    if (index == that.tabIndex) {
                        Batch_Arr.map(function (items, ind) {
                            var obj = {
                                GateEntryID: item.GateEntryID,
                                PONumber: item.PONumber,
                                ItemNo: item.ItemNo,
                                Material: item.Material,
                                MaterialDesc: item.MaterialDesc,
                                UOM: item.UOM,
                                Plant: item.Plant,
                                MovementType: item.MovementType,
                                PostedQuantity: item.PostedQuantity,
                                StorageLocation: item.StorageLocation,
                                Quantity: item.Quantity,
                                ItemCategory: item.ItemCategory,
                                Batch: items.Batch,
                                BatchQty: '',
                            };
                            aNewArr.push(obj)
                        })
                    } else {
                        aNewArr.push(item)
                    }
                })
                that.getView().getModel('oDataModel').setProperty("/aTableData", aNewArr);
            }
        },

        handle_table2Data1111: function () {
            var oBusyDialog = new sap.m.BusyDialog({ text: "Please Wait" });
            oBusyDialog.open();

            var firstTableData = this.getView().getModel("oTableDataModel").getProperty("/aTableData");
            console.log(firstTableData);

            var oModel = this.getView().getModel();
            var aTableArr = [];

            var aFilters = firstTableData.map(function (row) {
                return new sap.ui.model.Filter([
                    new sap.ui.model.Filter("PurchaseOrder", "EQ", row.Ponumber),
                    new sap.ui.model.Filter("PurchaseOrderItem", "EQ", row.Itemno)
                ], true);
            });

            var oCombinedFilter = new sap.ui.model.Filter({
                filters: aFilters,
                and: false
            });

            oModel.read("/Consumption_Item", {
                filters: oCombinedFilter,
                urlParameters: { "$top": "5000" },
                success: function (oresponse) {
                    oBusyDialog.close();
                    if (oresponse.results.length === 0) {
                        MessageBox.error("Not found");
                        this.getView().getModel("oTableDataModel2").setProperty("/aTableData2", []);
                    } else {
                        oresponse.results.map(function (items) {
                            var obj = {
                                GateEntryId: items.GateEntryId,
                                Ponumber: items.Ponumber,
                                Itemno: items.Itemno,
                                Material: items.Material,
                                Materialdesc: items.Materialdesc,
                                StorageLocation: items.StorageLocation,
                                Postedquantity: items.Postedquantity,
                            };
                            aTableArr.push(obj);
                        });
                        this.getView().getModel('oTableDataModel2').setProperty("/aTableData2", aTableArr);
                    }
                }.bind(this),
                error: function (error) {
                    oBusyDialog.close();
                    MessageBox.show(error.message, {
                        title: "Error",
                        icon: MessageBox.Icon.ERROR
                    });
                }
            });
        },
        onValueHelpRequestStorageLocation: function (oEvent) {
            var that = this;
            let plant = this.extractValue(this.getView().byId("Plant").getText());
            // ===================================================
            // 1. Capture Row Context (Material → Component)
            // ===================================================
            this.oSource = oEvent.getSource();
            this.sPath = this.oSource.getBindingContext("oDataModel").getPath();

            var oModel = this.getView().getModel("oDataModel");
            var oRowData = oModel.getProperty(this.sPath);

            var sComponent = (oRowData.Material || "").toString().slice(10); // last digits only

            // ===================================================
            // 2. Define Columns for Value Help
            // ===================================================
            var aCols = [
                { label: "Storage Location", path: "StorageLocation", width: "10rem" },
                { label: "Storage Location Name", path: "StorageLocationName", width: "15rem" }
            ];

            // ===================================================
            // 3. Create the ValueHelpDialog
            // ===================================================
            var oVHD = new ValueHelpDialog({
                title: "Storage Location",
                supportMultiselect: false,
                key: "StorageLocation",
                descriptionKey: "StorageLocation",
                contentWidth: "40%",
                ok: function (evt) {
                    var t = evt.getParameter("tokens");
                    var sKey = t.length ? t[0].getKey() : "";
                    // ✅ Write back into row field (instead of fixed input)
                    that.oSource.setValue(sKey);
                    oVHD.close();
                },
                cancel: function () { oVHD.close(); },
                afterClose: function () { oVHD.destroy(); }
            });

            // ===================================================
            // 4. Configure Table
            // ===================================================
            var oTable = oVHD.getTable();

            // Mandatory Product filter
            var oFilter = new sap.ui.model.Filter("Product", sap.ui.model.FilterOperator.EQ, sComponent);
            var oFilter2 = new sap.ui.model.Filter("Plant", sap.ui.model.FilterOperator.EQ, plant);

            if (oTable.bindRows) {
                // Grid Table (sap.ui.table.Table)
                aCols.forEach(c => oTable.addColumn(new sap.ui.table.Column({
                    label: c.label,
                    template: new sap.m.Text({ text: "{" + c.path + "}" }),
                    width: c.width
                })));

                oTable.bindRows({
                    path: "/StorageLocation_F4",
                    filters: [oFilter, oFilter2]
                });

            } else {
                // Responsive Table (sap.m.Table)
                aCols.forEach(c => oTable.addColumn(new sap.m.Column({
                    header: new sap.m.Label({ text: c.label })
                })));

                oTable.bindItems({
                    path: "/StorageLocation_F4",
                    filters: [oFilter, oFilter2],
                    template: new sap.m.ColumnListItem({
                        cells: aCols.map(c => new sap.m.Text({ text: "{" + c.path + "}" }))
                    })
                });
            }

            // ===================================================
            // 5. Central Search Function
            // ===================================================
            var fnDoSearch = function (sQuery) {
                sQuery = (sQuery || "").trim();

                var sAgg = oTable.bindRows ? "rows" : "items";
                var oBinding = oTable.getBinding(sAgg);

                if (!sQuery) {
                    oBinding.filter([]);
                    // Reapply only mandatory filters
                    oBinding.filter([oFilter, oFilter2], "Application");
                    return;
                }

                var aSearchFilters = [
                    new sap.ui.model.Filter("StorageLocation", sap.ui.model.FilterOperator.Contains, sQuery),
                    new sap.ui.model.Filter("StorageLocationName", sap.ui.model.FilterOperator.Contains, sQuery)
                ];

                var oOrFilter = new sap.ui.model.Filter({
                    filters: aSearchFilters,
                    and: false
                });

                // Combine search filter + Product filter
                var oCombined = new sap.ui.model.Filter({
                    filters: [oFilter, oFilter2, oOrFilter],
                    and: true
                });

                oBinding.filter([oCombined], "Application");
            };

            // ===================================================
            // 6. SearchField + FilterBar Setup
            // ===================================================
            var oBasicSearch = new sap.m.SearchField({
                width: "100%",
                search: function (oEvt) {
                    fnDoSearch(oEvt.getSource().getValue());
                }
            });

            var oFilterBar = new sap.ui.comp.filterbar.FilterBar({
                advancedMode: true,
                search: function () {
                    fnDoSearch(oBasicSearch.getValue());
                }
            });
            oFilterBar.setBasicSearch(oBasicSearch);
            oVHD.setFilterBar(oFilterBar);

            // ===================================================
            // 7. Prefill Search with existing value (if any)
            // ===================================================
            var sPrefill = this.oSource.getValue();
            oBasicSearch.setValue(sPrefill);
            oVHD.setBasicSearchText(sPrefill);

            // ===================================================
            // 8. Attach model and open dialog
            // ===================================================
            oTable.setModel(this.getView().getModel());
            oVHD.open();
        },
        onPostedQtyChange: function (oEvent) {
            var oInput = oEvent.getSource();
            var oContext = oInput.getBindingContext("oDataModel");
            if (!oContext) return;

            var oModel = oContext.getModel();
            var oParentData = oContext.getObject();

            // parent entered qty (user input)
            var parentEntered = parseFloat(oEvent.getParameter("value")) || 0;
            var parentQty = parseFloat(oParentData.Quantity) || 0;

            if (parentQty <= 0) {
                return; // avoid divide by zero
            }

            // update children
            if (oParentData.children && oParentData.children.length > 0) {
                oParentData.children.forEach(child => {
                    var childOldEntered = parseFloat(child.Quantity) || 0;
                    var newChildEntered = (childOldEntered / parentQty) * parentEntered;
                    child.Entered = newChildEntered.toFixed(2); // round to 2 decimals
                });

                // refresh model so UI updates
                oModel.refresh(true);
            }
        }


    });
});