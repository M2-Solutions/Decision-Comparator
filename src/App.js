import React, { useReducer } from 'react';
import { parseString } from 'xml2js';
import './App.css';

const checkCodeMapping = {
  'H218': 'CHED-PP HMI SMS',
  'H219': 'CHED-PP PHSI',
  'H220': 'CHED-PP HMI GMS',
  'H221': 'CHED-A',
  'H222': 'CHED-P (Non IUU)',
  'H223': 'CHED-D',
  'H224': 'CHED-P IUU',
};

function App() {
  console.log("App component is rendering");
  const initialState = {
    jsonData: null,
    alvsData: null,
    btmsData: null,
    parsedBtmsData: null,
    comparisonResults: [],
    error: null,
    jsonText: '',
    id: null,
  };

  const reducer = (state, action) => {
    switch (action.type) {
      case 'SET_JSON_DATA':
        return { ...state, jsonData: action.payload };
      case 'SET_ALVS_DATA':
        return { ...state, alvsData: action.payload };
      case 'SET_BTMS_DATA':
        return { ...state, btmsData: action.payload };
      case 'SET_PARSED_BTMS_DATA':
        return { ...state, parsedBtmsData: action.payload };
      case 'SET_COMPARISON_RESULTS':
        return { ...state, comparisonResults: action.payload };
      case 'SET_ERROR':
        return { ...state, error: action.payload };
      case 'SET_JSON_TEXT':
        return { ...state, jsonText: action.payload };
      case 'SET_ID':
       return { ...state, id: action.payload };
      default:
        return state;
    }
  };

  const [state, dispatch] = useReducer(reducer, initialState);
  const { comparisonResults, error, jsonText, id} = state;

  const handleError = (message) => {
    dispatch({ type: 'SET_ERROR', payload: message });
  };

  const handleJsonTextChange = (event) => {
    dispatch({ type: 'SET_JSON_TEXT', payload: event.target.value });
  };

  const handleParseJson = async () => {
    console.log("handleParseJson called");
    let xmlString = "";
    try {
      console.log("Parsing JSON");
      const data = JSON.parse(jsonText);
      dispatch({ type: 'SET_JSON_DATA', payload: data });
      dispatch({ type: 'SET_ID', payload: data.id });
      xmlString = data?.latest?.alvsXml;
      console.log("ALVS XML:", xmlString);
      const logXml = (xmlString) => {};
      logXml(xmlString);
      console.log("Calling parseString for ALVS XML");
      await parseString(data.latest.alvsXml, (err, result) => {
        if (err) {
          console.error("Error parsing ALVS XML:", err);
          console.log("ALVS XML parsing error object:", err);
          handleError("Error parsing ALVS XML: " + err.message);
          return;
        }
        dispatch({ type: 'SET_ALVS_DATA', payload: result });
        console.log("ALVS XML parsed result:", result);
        console.log("After parsing ALVS XML");

        console.log("Calling parseString for BTMS XML");
        new Promise((resolve, reject) => {
          parseString(data?.latest?.btmsXml, (err, btmsResult) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(btmsResult);
          });
        }).then((btmsResult) => {
          dispatch({ type: 'SET_BTMS_DATA', payload: btmsResult });

          const results = compareData(result, btmsResult);
          dispatch({ type: 'SET_COMPARISON_RESULTS', payload: results });
          console.log("After comparing data");
        });
      });
      console.log("handleParseJson completed successfully");
    } catch (err) {
      console.error("Error in handleParseJson:", err);
      handleError("Error parsing JSON: " + err.message);
    }
  };

  const getCode = (item, codeType) => {
    const checkKey = 'NS2:Check';
    const codeKey = `NS2:${codeType}`;
    const decisionCodeKey = 'NS2:DecisionCode';

    const checks = item[checkKey];
    if (!checks || !Array.isArray(checks)) {
      return [{ checkCode: 'N/A', decisionCode: 'N/A' }];
    }

    return checks.map(check => {
      const code = check[codeKey] && check[codeKey][0];
      const checkCode = code || 'N/A';
      const decisionCode = (check[decisionCodeKey] && check[decisionCodeKey][0]) || 'N/A';
      return {
        checkCode: `${checkCode} - ${checkCodeMapping[checkCode] || 'N/A'}`,
        decisionCode: decisionCode
      };
    });
  };

  const compareData = async (alvs, btms) => {
    
    let results = [];

    const findDecisionNotification = async (data) => {
        if (!data) {
        return null;
      }
      // Correctly traverse the XML structure to find DecisionNotification
      const body = data['NS1:Envelope']?.['NS1:Body']?.[0];
      if (!body) {
        console.warn("findDecisionNotification - NS1:Body not found.");
        return null;
      }

      const decisionNotification = body['NS3:DecisionNotification']?.[0];
      if (!decisionNotification) {
        console.warn("findDecisionNotification - NS3:DecisionNotification not found.");
        return null;
      }
      
      // Extract inner XML string
      const decisionNotificationXml = decisionNotification['_'];
      
      return decisionNotificationXml;
    };

    const alvsDecisionNotification = await findDecisionNotification(alvs);
    let alvsItems = null;

    if (!alvsDecisionNotification) {
      console.warn("alvsDecisionNotification is null or undefined.");
      return results;
    }

    // Standardize parsing logic for ALVS XML
    try {
      const alvsParseResult = await new Promise((resolve, reject) => {
        parseString(alvsDecisionNotification, (err, result) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(result);
        });
      });
      alvsItems = alvsParseResult?.['NS2:DecisionNotification']?.['NS2:Item'];
    } catch (err) {
      console.error("Error parsing ALVS DecisionNotification XML:", err);
      handleError("Error parsing ALVS DecisionNotification XML: " + err.message);
      return results; // Return early if parsing fails
    }
    
    if (!alvsItems) {
      console.warn("alvsItems is null or undefined, possibly due to missing DecisionNotification or Item elements in ALVS data.");
      return results;
    }

  const btmsEnvelope = btms['NS1:Envelope'];
  const btmsBody = btmsEnvelope?.['NS1:Body']?.[0];
  let btmsDecisionNotification = btmsBody?.['NS3:DecisionNotification']?.[0];
  let btmsInnerDecisionNotification = null;
  let btmsItems = null;

  // Apply findDecisionNotification to BTMS XML
  if (btms) {
    btmsDecisionNotification = await findDecisionNotification(btms);
    
    
  }

  if (btmsDecisionNotification && typeof btmsDecisionNotification === 'string') {
    try {
      const btmsParseResult = await new Promise((resolve, reject) => {
        parseString(btmsDecisionNotification, (err, parsedBtms) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(parsedBtms);
        });
      });
      btmsInnerDecisionNotification = btmsParseResult?.['NS2:DecisionNotification'];
      if (btmsInnerDecisionNotification) {
        btmsItems = btmsInnerDecisionNotification['NS2:Item'] ? btmsInnerDecisionNotification['NS2:Item'] : null;
      } else {
        console.warn("btmsInnerDecisionNotification is null or undefined.");
      }
    } catch (err) {
      console.error("Error parsing inner BTMS XML:", err);
      // Do not return results here, as ALVS data might still be valid for comparison
  
    }
  
  }

  console.log("btmsBody:", btmsBody);
  console.log("btmsDecisionNotification:", btmsDecisionNotification);
  console.log("btmsInnerDecisionNotification:", btmsInnerDecisionNotification);
  console.log("btmsItems:", btmsItems);

  if (alvsItems) {
    alvsItems.forEach((alvsItem) => {
      const itemNumber = alvsItem['NS2:ItemNumber'] ? alvsItem['NS2:ItemNumber'][0] : 'N/A';
      const alvsCheckCodeObjects = getCode(alvsItem, 'CheckCode');
      
      

      let btmsItem = null;
      let btmsCheckCodeObjects = [{ checkCode: 'N/A', decisionCode: 'N/A' }];

      if (btmsItems) {
        btmsItem = btmsItems.find((btmsItem) => btmsItem['NS2:ItemNumber'] && btmsItem['NS2:ItemNumber'][0] === itemNumber);

        if (btmsItem) {
          btmsCheckCodeObjects = getCode(btmsItem, 'CheckCode');
        }
      }

      const matches = [];
      alvsCheckCodeObjects.forEach(alvsCheck => {
        let matchFound = false;
        btmsCheckCodeObjects.forEach(btmsCheck => {
          if (alvsCheck.checkCode === btmsCheck.checkCode) {
            matches.push(alvsCheck.decisionCode === btmsCheck.decisionCode);
            matchFound = true;
          }
        });
        if (!matchFound) {
          matches.push(false);
        }
      });

      results.push({
        itemNumber: itemNumber,
        alvsCheckCodeObjects: alvsCheckCodeObjects,
        btmsCheckCodeObjects: btmsCheckCodeObjects,
        matches: matches,
      });
    
    });
    dispatch({ type: 'SET_COMPARISON_RESULTS', payload: results });

    return results;
  }
}


  console.log("App component is about to return JSX");
  console.log("Before rendering the main div");
  console.log("After rendering comparison results")
  return (
    <div className="App">
      <h1>Decision Comparator</h1>
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <textarea
          rows="20"
          cols="50"
          placeholder="Paste JSON here"
          value={jsonText}
          onChange={handleJsonTextChange}
        />
        {error && <p className="error">{error}</p>}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <button onClick={async () => {
            console.log("Compare button clicked");
            await handleParseJson();
          }}>Compare</button>
          <button onClick={clearAll}>Clear</button>
        </div>
      </div>
      {comparisonResults.length > 0 && (
        <div>
          <h2>Comparison Results for {id}</h2>
          <table>
            <thead>
              <tr>
                <th>Item Number</th>
                <th>ALVS Check Code</th>
                <th>ALVS Decision Code</th>
                <th>BTMS Check Code</th>
                <th>BTMS Decision Code</th>
                <th>Match</th>
              </tr>
              
            </thead>
            <tbody>
            <React.Fragment>
              {comparisonResults.map((result, index) => (
                result.alvsCheckCodeObjects.map((alvsCheck, checkIndex) => (
                  <tr key={`${index}-${checkIndex}`}>
                    <td>{result.itemNumber}</td>
                    <td>{alvsCheck.checkCode}</td>
                    <td>{alvsCheck.decisionCode}</td>
                    <td>{result.btmsCheckCodeObjects[checkIndex]?.checkCode || 'N/A'}</td>
                    <td>{result.btmsCheckCodeObjects[checkIndex]?.decisionCode || 'N/A'}</td>
                    <td className={`${result.matches[checkIndex] ? 'match-true' : 'match-false'}`}>{result.matches[checkIndex] ? 'True' : 'False'}</td>
                  </tr>
                ))
              ))}
            </React.Fragment>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  function clearAll() {
    dispatch({ type: 'SET_JSON_TEXT', payload: '' });
    dispatch({ type: 'SET_ERROR', payload: null });
    dispatch({ type: 'SET_COMPARISON_RESULTS', payload: [] });
  }
}



  

export default React.memo(App);
